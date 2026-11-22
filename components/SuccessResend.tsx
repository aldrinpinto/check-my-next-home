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
  const [answer, setAnswer] = useState<string | null>(null);

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
      setAnswer(response.ok && data?.sent ? sentLine : failedLine);
    } catch {
      setAnswer(failedLine);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="report-success__resend">
      <button type="button" className="btn btn--forest" onClick={onResend} disabled={busy}>
        {label}
      </button>
      {answer && (
        <p className="report-success__resend-answer" role="status">
          {answer}
        </p>
      )}
    </div>
  );
}
