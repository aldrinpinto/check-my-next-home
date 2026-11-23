// The sold-prices monthly update job (Price Paid national
// step, adopted prep gap 11) — the thin shell the server's
// cron runs twice a month (23rd and 30th, next to the fulfil
// worker's shape): it runs the sold-prices loader's --update
// mode once and, when that run FAILS or REFUSES (a missed
// month, an unreadable file, a database error), it emails the
// owner through the existing owner-mailer (the
// CONTACT_NOTIFICATION_FROM sender, to the project inbox) so
// a silent register is impossible. The run is ALSO stamped in
// the loader_runs tables by the loader itself (gap 4), so the
// failure stands in two places: this inbox alert and the
// runner's own history.
//
// The entry shape is the worker runner's
// (scripts/fulfil-reports.ts): the work lives inside main(),
// the module runs it ONLY when executed directly (BUG-107's
// discipline — tsx transforms this entry to CommonJS, which
// refuses a top-level await), and the server machinery is
// imported dynamically inside main(), so importing this
// module is side-effect-free.
//
// Usage (the cron line, installed at deploy time):
//   npm run sold-prices:monthly
// Any arguments are forwarded to the loader after --update
// (an operator can run it against fixture files with
// --file <dir> --edition <date>).
// Environment: the server's own .env.local (DATABASE_URL for
// the loader, the mailer configuration for the alert).

import { execFile } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import type { ComposedEmail } from "../lib/download";

const execFileAsync = promisify(execFile);
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export interface UpdateFailureFacts {
  // The update file's edition as the loader named it in its
  // own output, or null when the run never got that far.
  edition: string | null;
  // The loader's own failure headline, verbatim where the
  // output carries one.
  errorLine: string;
}

// Reads the two facts the alert carries out of the loader's
// combined output: the edition it attempted (its success line
// and its refusal messages both name it) and its failure
// headline (the FAILED line the loader's entry prints, else
// the last line of output).
export function failureFacts(output: string): UpdateFailureFacts {
  const editionMatch = /edition (\d{4}-\d{2}-\d{2})/.exec(output);
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
  const failedLine = [...lines].reverse().find((line) => line.includes("FAILED"));
  return {
    edition: editionMatch ? editionMatch[1] : null,
    errorLine: failedLine ?? lines[lines.length - 1] ?? "the loader produced no output",
  };
}

// The owner alert for a failed or refused monthly update —
// factual only (which month, what failed), plus the remedy a
// missed-month refusal needs, because that is the one failure
// whose fix is a different command.
export function composeUpdateFailureAlert(facts: UpdateFailureFacts): ComposedEmail {
  const edition = facts.edition ?? "not read";
  const subject = `[Check My Next Home] Sold prices monthly update FAILED — edition ${edition}`;
  const lines = [
    "The monthly sold-prices update failed, so the Price Paid register was NOT updated — the site keeps serving the previous figures.",
    "",
    "Job: load-sold-prices --update (scripts/sold-prices-monthly.ts, server cron, twice monthly).",
    `Edition attempted: ${edition}.`,
    `What failed: ${facts.errorLine}`,
    "",
    "If the failure names a missed month, the remedy is one command on the server: npm run load:sold-prices-national — the national pass files the complete register and heals any gap. Every other failure is in the run's log on the server and in the loader_runs tables, where this failed run is stamped too.",
  ];
  const text = lines.join("\n");
  const html = lines
    .map((line) => (line === "" ? "" : `<p style="margin:0 0 10px">${escapeHtml(line)}</p>`))
    .join("\n");
  return { subject, text, html };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  let output = "";
  let exitCode = 0;
  try {
    const result = await execFileAsync(
      process.execPath,
      ["loaders/load-sold-prices.mjs", "--update", ...argv],
      { cwd: REPO_ROOT, maxBuffer: 64 * 1024 * 1024 },
    );
    output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  } catch (error) {
    const failed = error as { code?: number; stdout?: string; stderr?: string };
    exitCode = typeof failed.code === "number" ? failed.code : 1;
    output = `${failed.stdout ?? ""}${failed.stderr ?? ""}`;
    if (output.trim() === "") {
      output = `the loader could not be started: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
  // The cron log carries the loader's whole output either way.
  process.stdout.write(output.endsWith("\n") ? output : `${output}\n`);
  if (exitCode === 0) return 0;

  const facts = failureFacts(output);
  const email = composeUpdateFailureAlert(facts);
  try {
    const { getOwnerMailer } = await import("../lib/server/owner-mailer");
    const sent = await getOwnerMailer().sendFailureAlert({ email });
    if (sent.sent) {
      console.log(
        `sold-prices-monthly: failure alert sent to the owner (${facts.edition ?? "edition not read"}).`,
      );
    } else {
      console.error(
        `sold-prices-monthly: the failure alert was NOT sent (${sent.reason ?? "the mailer declined"}) — the failure stands in this log and in the loader_runs stamp.`,
      );
    }
  } catch (error) {
    console.error(
      `sold-prices-monthly: the failure alert could not be sent (${error instanceof Error ? error.message : String(error)}) — the failure stands in this log and in the loader_runs stamp.`,
    );
  }
  return exitCode;
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      console.error(
        `sold-prices-monthly FAILED: ${error instanceof Error ? error.message : String(error)}`,
      );
      process.exitCode = 1;
    });
}
