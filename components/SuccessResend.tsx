"use client";

import { useState } from "react";

// The buyer re-send (plan step M9.7, ruling R1): a
// control on the success surface that sends THIS
// order's standing delivery email again, to the
// address already on the order — no new delivery, no
// new link record, no new gift (the seam is
// lib/server/report-resend.ts). It answers the two
// cases the email card names: the email that never
// went out, and the email that went out but isn't in
// the buyer's inbox. Client-only state; its words
// arrive as props from the view (lib/report-success.ts
// stays out of the browser's module graph), the answer
// line replaces the button's invitation once the send
// is answered, and a failed send re-arms the button.
// BUG-146 (founder finding, 22 Nov 2026): the FAILED
// answer wears the site's failure treatment — the
// BUG-132 consent error's tinted box — and announces
// itself as an alert; it rendered as plain black text
// before, indistinguishable from the sent answer. The
// sent answer keeps its plain dress.
export default function SuccessResend({
  orderRef,
  label,
  sentLine,
  failedLine,
}: {
  orderRef: string;
  label: string;
  sentLine: string;
  failedLine: string;
}) {
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<{ kind: "sent" | "failed"; line: string } | null>(null);

  async function onResend() {
    if (busy) return;
    setBusy(true);
    setAnswer(null);
    try {
      const response = await fetch("/api/report/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: orderRef }),
      });
      const data = (await response.json().catch(() => null)) as { sent?: boolean } | null;
      setAnswer(
        response.ok && data?.sent
          ? { kind: "sent", line: sentLine }
          : { kind: "failed", line: failedLine },
      );
    } catch {
      setAnswer({ kind: "failed", line: failedLine });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="report-success__resend">
      <button type="button" className="btn btn--forest" onClick={onResend} disabled={busy}>
        {label}
      </button>
      {answer &&
        (answer.kind === "failed" ? (
          <p
            className="report-success__resend-answer report-success__resend-answer--failed"
            role="alert"
          >
            {answer.line}
          </p>
        ) : (
          <p className="report-success__resend-answer" role="status">
            {answer.line}
          </p>
        ))}
    </div>
  );
}
