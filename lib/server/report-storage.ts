import { createHash, createHmac } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

// The stored report PDF (plan step M8.4, prep point 7):
// the storage seam the PDF twin writes through and the
// re-send paths (M8.6's links, M9's delivery) read back.
// The stored file is what a re-send serves — never a
// regeneration — so the seam is a plain key/value store
// for PDF bytes, addressed by lib/report-pdf.ts's
// reportPdfKey.
//
// Two implementations, in the mailer seams' discipline
// (a put answers a value, never a throw, so a storage
// failure can never masquerade as a generated report):
//   - R2 — the project's free backup storage
//     (Cloudflare R2), spoken to through its
//     S3-compatible API with hand-rolled Signature V4
//     signing (the repo carries no AWS SDK, and one PUT
//     and one GET do not earn one). Selected when the
//     environment carries the endpoint, bucket and key
//     pair; the play server carries none of them today,
//     so there this implementation is simply never
//     selected.
//   - Local — a directory on this machine. The proof
//     and development implementation: the tests inject
//     it against a temp directory, and an unconfigured
//     environment falls back to it under the OS temp
//     directory, so generation always has somewhere
//     honest to write.

export type ReportPdfPutResult = { stored: true } | { stored: false; reason: string };

export interface ReportPdfStore {
  put(key: string, bytes: Uint8Array): Promise<ReportPdfPutResult>;
  // The stored bytes, or null where the key holds
  // nothing. A backend failure is NOT an absence: it
  // throws, and the caller decides what honesty needs.
  get(key: string): Promise<Uint8Array | null>;
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "Error";
}

// Keys come from reportPdfKey (a postcode directory and
// a home slug); the local store still refuses anything
// that could climb out of its root.
function localPathFor(rootDir: string, key: string): string {
  if (key.split("/").some((part) => part === ".." || part === "")) {
    throw new Error(`refusing a report key that is not a plain path: ${key}`);
  }
  return join(rootDir, key);
}

export function createLocalReportPdfStore(rootDir: string): ReportPdfStore {
  return {
    async put(key, bytes) {
      try {
        const path = localPathFor(rootDir, key);
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, bytes);
        return { stored: true };
      } catch (error) {
        return { stored: false, reason: `local store failed (${errorName(error)})` };
      }
    },
    async get(key) {
      try {
        return new Uint8Array(await readFile(localPathFor(rootDir, key)));
      } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return null;
        throw error;
      }
    },
  };
}

// ------------------------------------------------------------------
// R2 over its S3-compatible API (Signature V4)
// ------------------------------------------------------------------

export interface R2ReportPdfStoreConfig {
  // e.g. https://<account-id>.r2.cloudflarestorage.com
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  // R2 signs with the "auto" region.
  region?: string;
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

function sha256Hex(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

// One signed S3 request. The canonical form signs the
// host and the payload hash alongside the date header —
// the subset R2's S3 API requires — with each key
// segment URI-encoded and the slashes between them kept.
async function r2Request(
  config: R2ReportPdfStoreConfig,
  method: "GET" | "PUT",
  key: string,
  body: Uint8Array | null,
): Promise<Response> {
  const region = config.region ?? "auto";
  const endpoint = config.endpoint.replace(/\/+$/, "");
  const host = new URL(endpoint).host;
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  const path = `/${config.bucket}/${encodedKey}`;
  const now = new Date();
  const amzDate = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(body ?? new Uint8Array());
  const headers: Record<string, string> = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  if (method === "PUT") headers["content-type"] = "application/pdf";
  const signedNames = Object.keys(headers).sort();
  const canonicalHeaders = signedNames.map((name) => `${name}:${headers[name]}\n`).join("");
  const canonicalRequest = [
    method,
    path,
    "",
    canonicalHeaders,
    signedNames.join(";"),
    payloadHash,
  ].join("\n");
  const scope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(canonicalRequest)].join("\n");
  const kDate = hmac(`AWS4${config.secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, "s3");
  const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign, "utf8").digest("hex");
  headers["Authorization"] =
    `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, ` +
    `SignedHeaders=${signedNames.join(";")}, Signature=${signature}`;
  return fetch(`${endpoint}${path}`, {
    method,
    headers,
    body: body ? Buffer.from(body) : undefined,
  });
}

export function createR2ReportPdfStore(config: R2ReportPdfStoreConfig): ReportPdfStore {
  return {
    async put(key, bytes) {
      try {
        const response = await r2Request(config, "PUT", key, bytes);
        if (!response.ok) return { stored: false, reason: `R2 answered ${response.status}` };
        return { stored: true };
      } catch (error) {
        return { stored: false, reason: `R2 put failed (${errorName(error)})` };
      }
    },
    async get(key) {
      const response = await r2Request(config, "GET", key, null);
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`R2 get failed: R2 answered ${response.status}`);
      return new Uint8Array(await response.arrayBuffer());
    },
  };
}

// The environment's store: R2 when its four values are
// configured, the local store otherwise (rooted at
// REPORT_PDF_STORAGE_DIR where set, else a directory
// under the OS temp dir).
export function getReportPdfStore(): ReportPdfStore {
  const endpoint = process.env.REPORT_PDF_R2_ENDPOINT;
  const bucket = process.env.REPORT_PDF_R2_BUCKET;
  const accessKeyId = process.env.REPORT_PDF_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.REPORT_PDF_R2_SECRET_ACCESS_KEY;
  if (endpoint && bucket && accessKeyId && secretAccessKey) {
    return createR2ReportPdfStore({ endpoint, bucket, accessKeyId, secretAccessKey });
  }
  return createLocalReportPdfStore(
    process.env.REPORT_PDF_STORAGE_DIR ?? join(tmpdir(), "cmnh-report-pdfs"),
  );
}
