"use client";

// The admin page's one working control (M9.11, the
// founder's resend rider of 22 Nov 2026): it asks the
// page's own route to run M9.10's owner re-send for
// this order. The route names the order's recorded
// email as the requester — the engine sends only
// there, and refuses a withdrawn (refunded) order
// itself; the outcomes below are those answers in
// plain words. Every attempt, refused or sent, lands
// in the order's delivery log, which the page re-reads
// after a send.

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AdminResendButton({ orderRef, email }: { orderRef: string; email: string }) {
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [outcome, setOutcome] = useState<string | null>(null);

  async function resend() {
    setSending(true);
    setOutcome(null);
    try {
      const response = await fetch("/admin/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ref: orderRef }),
      });
      const result = (await response.json()) as
        { ok: true; sent: boolean } | { ok: false; reason: string };
      if (result.ok) {
        setOutcome(
          result.sent
            ? `Sent again to ${email}.`
            : "The re-send ran, but the email did not go out — it is in the order's log below.",
        );
        router.refresh();
      } else if (result.reason === "not-found") {
        setOutcome("This order's report has been withdrawn, so there is nothing to re-send.");
      } else if (result.reason === "not-configured") {
        setOutcome("Email sending is not set up on this server, so the re-send could not run.");
      } else {
        setOutcome("That order could not be found, so nothing was sent.");
      }
    } catch {
      setOutcome("The re-send could not be run just now — nothing was sent.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <button type="button" className="adm-refresh" onClick={resend} disabled={sending}>
        {sending ? "Sending…" : "Re-send the delivery email"}
      </button>
      {outcome ? (
        <p className="adm-resend__outcome" role="status">
          {outcome}
        </p>
      ) : null}
    </div>
  );
}
