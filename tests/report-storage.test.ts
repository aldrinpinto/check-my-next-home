import { createServer, type IncomingMessage, type Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createLocalReportPdfStore,
  createR2ReportPdfStore,
  getReportPdfStore,
} from "../lib/server/report-storage";

// The stored report PDF (plan step M8.4, prep point 7):
// the storage seam's two implementations. The local
// store is proven against a real temp directory; the R2
// store is proven against a local HTTP stub that plays
// the S3 endpoint — the request's shape and its
// Signature V4 are asserted from what the stub received,
// and the signature is re-derived independently from
// the captured headers and the (dummy, test-only) secret.

const KEY = "reports/CM32JT/19-birkdale-rise.pdf";
const BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]); // "%PDF-1.7"

describe("report storage — the local store", () => {
  let root = "";
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "cmnh-report-store-"));
  });
  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("a stored file reads back byte for byte — the read a re-send serves", async () => {
    const store = createLocalReportPdfStore(root);
    expect(await store.put(KEY, BYTES)).toEqual({ stored: true });
    expect(await store.get(KEY)).toEqual(BYTES);
  });

  it("a key that holds nothing reads as null, not an error", async () => {
    const store = createLocalReportPdfStore(root);
    expect(await store.get("reports/ZZ99ZZ/none.pdf")).toBeNull();
  });

  it("a key that climbs out of the root is refused, as a value", async () => {
    const store = createLocalReportPdfStore(root);
    const result = await store.put("../escape.pdf", BYTES);
    expect(result.stored).toBe(false);
  });
});

// ------------------------------------------------------------------
// The R2 stub: an HTTP server standing in for the S3
// endpoint, capturing each request whole.
// ------------------------------------------------------------------

interface CapturedRequest {
  method: string;
  url: string;
  headers: IncomingMessage["headers"];
  body: Buffer;
}

function startStub(
  handler: (req: CapturedRequest, res: import("node:http").ServerResponse) => void,
) {
  const captured: CapturedRequest[] = [];
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const capturedReq: CapturedRequest = {
        method: req.method ?? "",
        url: req.url ?? "",
        headers: req.headers,
        body: Buffer.concat(chunks),
      };
      captured.push(capturedReq);
      handler(capturedReq, res);
    });
  });
  return new Promise<{ server: Server; captured: CapturedRequest[]; endpoint: string }>(
    (resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        const port = typeof address === "object" && address ? address.port : 0;
        resolve({ server, captured, endpoint: `http://127.0.0.1:${port}` });
      });
    },
  );
}

const DUMMY = {
  accessKeyId: "test-access-key-id",
  secretAccessKey: "test-secret-access-key",
  bucket: "cmnh-reports",
};

describe("report storage — the R2 store over its S3 API", () => {
  it("PUTs the bytes to the bucket key with a verifiable Signature V4", async () => {
    const { server, captured, endpoint } = await startStub((_req, res) => {
      res.writeHead(200).end();
    });
    try {
      const store = createR2ReportPdfStore({ endpoint, ...DUMMY });
      expect(await store.put(KEY, BYTES)).toEqual({ stored: true });
      expect(captured).toHaveLength(1);
      const req = captured[0];
      expect(req.method).toBe("PUT");
      expect(req.url).toBe(`/${DUMMY.bucket}/${KEY}`);
      expect(req.headers["content-type"]).toBe("application/pdf");
      expect(req.body).toEqual(Buffer.from(BYTES));

      // Re-derive the signature from the captured
      // headers, independently of the implementation.
      const { createHash, createHmac } = await import("node:crypto");
      const amzDate = String(req.headers["x-amz-date"]);
      const payloadHash = String(req.headers["x-amz-content-sha256"]);
      expect(payloadHash).toBe(createHash("sha256").update(BYTES).digest("hex"));
      const host = String(req.headers.host);
      const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
      const canonical = [
        "PUT",
        `/${DUMMY.bucket}/${KEY}`,
        "",
        `content-type:application/pdf\nhost:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`,
        signedHeaders,
        payloadHash,
      ].join("\n");
      const dateStamp = amzDate.slice(0, 8);
      const scope = `${dateStamp}/auto/s3/aws4_request`;
      const stringToSign = [
        "AWS4-HMAC-SHA256",
        amzDate,
        scope,
        createHash("sha256").update(canonical).digest("hex"),
      ].join("\n");
      const hmac = (key: Buffer | string, value: string) =>
        createHmac("sha256", key).update(value, "utf8").digest();
      const signing = hmac(
        hmac(hmac(hmac(`AWS4${DUMMY.secretAccessKey}`, dateStamp), "auto"), "s3"),
        "aws4_request",
      );
      const signature = createHmac("sha256", signing).update(stringToSign, "utf8").digest("hex");
      expect(req.headers.authorization).toBe(
        `AWS4-HMAC-SHA256 Credential=${DUMMY.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      );
    } finally {
      server.close();
    }
  });

  it("GETs the stored bytes back, and a 404 reads as absence", async () => {
    const { server, endpoint } = await startStub((req, res) => {
      if (req.url.endsWith("none.pdf")) res.writeHead(404).end();
      else res.writeHead(200, { "content-type": "application/pdf" }).end(Buffer.from(BYTES));
    });
    try {
      const store = createR2ReportPdfStore({ endpoint, ...DUMMY });
      expect(await store.get(KEY)).toEqual(BYTES);
      expect(await store.get("reports/ZZ99ZZ/none.pdf")).toBeNull();
    } finally {
      server.close();
    }
  });

  it("a refused PUT answers stored: false with the status, never a throw", async () => {
    const { server, endpoint } = await startStub((_req, res) => {
      res.writeHead(403).end();
    });
    try {
      const store = createR2ReportPdfStore({ endpoint, ...DUMMY });
      const result = await store.put(KEY, BYTES);
      expect(result).toEqual({ stored: false, reason: "R2 answered 403" });
    } finally {
      server.close();
    }
  });

  it("the environment selects R2 when its four values are set, the local store otherwise", async () => {
    const { server, captured, endpoint } = await startStub((_req, res) => {
      res.writeHead(200).end();
    });
    const saved = { ...process.env };
    try {
      process.env.REPORT_PDF_R2_ENDPOINT = endpoint;
      process.env.REPORT_PDF_R2_BUCKET = DUMMY.bucket;
      process.env.REPORT_PDF_R2_ACCESS_KEY_ID = DUMMY.accessKeyId;
      process.env.REPORT_PDF_R2_SECRET_ACCESS_KEY = DUMMY.secretAccessKey;
      const store = getReportPdfStore();
      expect(await store.put(KEY, BYTES)).toEqual({ stored: true });
      expect(captured).toHaveLength(1);

      delete process.env.REPORT_PDF_R2_ENDPOINT;
      delete process.env.REPORT_PDF_R2_BUCKET;
      delete process.env.REPORT_PDF_R2_ACCESS_KEY_ID;
      delete process.env.REPORT_PDF_R2_SECRET_ACCESS_KEY;
      const localRoot = await mkdtemp(join(tmpdir(), "cmnh-report-store-env-"));
      process.env.REPORT_PDF_STORAGE_DIR = localRoot;
      const local = getReportPdfStore();
      expect(await local.put(KEY, BYTES)).toEqual({ stored: true });
      expect(await local.get(KEY)).toEqual(BYTES);
      await rm(localRoot, { recursive: true, force: true });
    } finally {
      process.env = saved;
      server.close();
    }
  });
});
