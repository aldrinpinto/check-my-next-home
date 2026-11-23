// The order lookup and owner re-send tool (plan step
// M9.10, prep gap 10) — the thin shell over
// lib/server/order-admin.ts, in the worker runner's
// entry shape (scripts/fulfil-reports.ts): the work
// lives inside main(), the module runs it ONLY when
// executed directly (BUG-107's discipline — tsx
// transforms this entry to CommonJS, which refuses a
// top-level await), and the server machinery is
// imported dynamically inside main(), so importing
// this module is side-effect-free.
//
// WHAT IT DOES (support's two jobs):
//   - LOOK UP an order by the buyer's email, by
//     postcode, or by its reference, and print the
//     whole standing: the order record, the claim, the
//     delivery, the refunds (read live from M9.8's
//     overlay), the notice markers, and the delivery
//     log.
//   - RE-SEND a delivered report email at the buyer's
//     request: --resend <ref> --requester <email>. The
//     requester must be the order's own buyer (the
//     check and its outcome are written to the delivery
//     log), and what goes out is the standing
//     delivery's email over the identical stored PDF,
//     to the address the order already carries. THERE
//     IS NO ADDRESS ARGUMENT — by construction, this
//     tool cannot send a report anywhere but to its
//     own buyer. A refunded order's delivery is
//     withdrawn and cannot be resent (M9.8's refusal,
//     inherited from the re-send seam).
//
// Usage:
//   npx -y tsx scripts/order-lookup.ts --email buyer@example.co.uk
//   npx -y tsx scripts/order-lookup.ts --postcode "CM3 2JT"
//   npx -y tsx scripts/order-lookup.ts --ref pi_...
//   npx -y tsx scripts/order-lookup.ts --resend pi_... --requester buyer@example.co.uk
// Environment: the server's own .env.local / .env
// (DATABASE_URL, the signing secret, the mailer
// configuration), plus APP_ORIGIN for the re-sent
// email's links (default the site's own URL).

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { OrderSummary } from "../lib/server/order-admin";

function loadEnvLocal() {
  for (const name of [".env.local", ".env"]) {
    const path = join(process.cwd(), name);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const match = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (match && process.env[match[1]] === undefined) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
      }
    }
  }
}

const USAGE = [
  "Usage:",
  "  order-lookup --email <buyer email>",
  "  order-lookup --postcode <postcode>",
  "  order-lookup --ref <order reference>",
  "  order-lookup --resend <order reference> --requester <requester email>",
].join("\n");

function argValue(argv: string[], name: string): string | null {
  const index = argv.indexOf(name);
  if (index < 0) return null;
  const value = argv[index + 1];
  return value && !value.startsWith("--") ? value : null;
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  loadEnvLocal();

  const email = argValue(argv, "--email");
  const postcode = argValue(argv, "--postcode");
  const ref = argValue(argv, "--ref");
  const resend = argValue(argv, "--resend");
  const requester = argValue(argv, "--requester");

  const lookups = [email, postcode, ref].filter((value) => value !== null).length;
  if (resend ? lookups > 0 || !requester : lookups !== 1) {
    console.error(USAGE);
    return 2;
  }

  const { SITE_URL } = await import("../lib/site");
  const { getDbPool } = await import("../lib/server/db");
  const { createDbFulfilmentClaimStore } = await import("../lib/server/fulfilment");
  const { createDbGiftStore } = await import("../lib/server/gifts");
  const { findOrders, ownerResendOrder } = await import("../lib/server/order-admin");
  const { createDbOrderStore } = await import("../lib/server/orders");
  const { createDbDeliveryStore } = await import("../lib/server/report-deliveries");
  const { getReportDeliveryService } = await import("../lib/server/report-delivery");
  const { createDbRefundStore, createRefundProcessing } = await import("../lib/server/refunds");

  const pool = getDbPool();
  const claims = createDbFulfilmentClaimStore(pool);
  const deliveries = createDbDeliveryStore(pool);
  const refunds = createDbRefundStore(pool);
  const deps = {
    orders: createDbOrderStore(pool),
    claims,
    deliveries,
    refunds,
    refundCheck: createRefundProcessing({
      refunds,
      claims,
      deliveries,
      gifts: createDbGiftStore(pool),
    }),
    delivery: getReportDeliveryService(),
  };

  if (resend) {
    const result = await ownerResendOrder(deps, {
      ref: resend,
      requesterEmail: requester as string,
      origin: process.env.APP_ORIGIN ?? SITE_URL,
    });
    if (!result.ok) {
      console.log(`order-lookup: re-send refused for ${resend} — ${result.reason}`);
      return 1;
    }
    console.log(
      result.sent
        ? `order-lookup: re-sent the delivery email for ${resend} to the order's buyer`
        : `order-lookup: the re-send for ${resend} was attempted but the email did not go out (logged)`,
    );
    return result.sent ? 0 : 1;
  }

  const summaries = await findOrders(
    deps,
    email ? { email } : postcode ? { postcode } : { ref: ref as string },
  );
  if (summaries.length === 0) {
    console.log("order-lookup: no orders found");
    return 0;
  }
  for (const summary of summaries) console.log(formatSummary(summary));
  return 0;
}

// One order's whole standing, in support's terms.
function formatSummary(summary: OrderSummary): string {
  const { order, claim, deliveries, refunds, refundedInFull, log } = summary;
  const lines: string[] = [];
  lines.push(
    `Order ${order.ref} — ${order.kind}${order.testOrder ? " (TEST)" : ""}, taken ${order.createdAt.toISOString()}`,
  );
  lines.push(`  Buyer: ${order.email}`);
  lines.push(`  Home: ${order.postcode}${order.homeKey ? ` (key ${order.homeKey})` : ""}`);
  if (order.amount !== null) {
    lines.push(`  Amount: ${order.amount} ${order.currency ?? ""} via ${order.providerRef ?? ""}`);
    lines.push(
      `  Consent: ${order.consentTick ? "ticked" : "not ticked"} at ${order.consentTimestamp ?? "—"}`,
    );
  }
  lines.push(
    claim
      ? `  Claim: ${claim.status}${claim.deliveryId ? `, delivery ${claim.deliveryId}` : ""}${
          claim.mailSent !== null ? `, delivery email ${claim.mailSent ? "sent" : "NOT sent"}` : ""
        }${claim.lastError ? `, last error ${claim.lastError}` : ""}`
      : "  Claim: none stands",
  );
  for (const delivery of deliveries) {
    lines.push(
      `  Delivery ${delivery.id}: ${delivery.homeTitle} (${delivery.homeAddressLine})${
        delivery.withdrawnAt ? ` — WITHDRAWN by refund ${delivery.withdrawnRefundId ?? ""}` : ""
      }`,
    );
  }
  if (order.kind === "paid") {
    lines.push(
      refunds.length === 0
        ? "  Refunds: none"
        : `  Refunds: ${refunds
            .map(
              (refund) => `${refund.refundId} ${refund.amount} ${refund.currency} ${refund.status}`,
            )
            .join("; ")}${refundedInFull ? " — FULLY REFUNDED" : ""}`,
    );
  }
  lines.push(
    `  Sale alert: ${order.saleAlertSentAt ? `sent ${order.saleAlertSentAt.toISOString()}` : "not sent"}`,
  );
  lines.push(
    `  Failure notice: ${
      order.failureNoticeSentAt ? `sent ${order.failureNoticeSentAt.toISOString()}` : "not sent"
    }`,
  );
  if (log.length > 0) {
    lines.push("  Delivery log:");
    for (const entry of log) {
      lines.push(
        `    ${entry.createdAt.toISOString()} ${entry.kind} ${entry.sent ? "sent" : "NOT sent"}${
          entry.detail ? ` — ${entry.detail}` : ""
        }`,
      );
    }
  }
  return lines.join("\n");
}

// Executed directly (a hand run) the module runs its
// lookup; imported (a test, a tool) it does nothing
// at all.
const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (invokedDirectly) {
  main().then(
    (code) => process.exit(code),
    (error: unknown) => {
      console.error(
        `order-lookup: ${error instanceof Error ? error.message : "the lookup failed"}`,
      );
      process.exit(1);
    },
  );
}
