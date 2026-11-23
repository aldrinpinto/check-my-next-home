import type { ReactNode } from "react";

import {
  DOWNLOAD_EMAIL_LABEL,
  DOWNLOAD_EXPIRED_BODY,
  DOWNLOAD_EXPIRED_FINE_PRINT,
  DOWNLOAD_EXPIRED_HEADING,
  DOWNLOAD_REFUNDED_BODY,
  DOWNLOAD_REFUNDED_HEADING,
  DOWNLOAD_REISSUE_BUTTON,
  DOWNLOAD_SENT_AGAIN_LINE,
  DOWNLOAD_SENT_BODY,
  DOWNLOAD_SENT_HEADING,
  downloadReissuePostPath,
} from "../lib/download";
import { Button, TextField } from "./kit";

// M8.6 — the download link's two landing screens
// (Master views 32 and 33): the expired card and the
// fresh-link-sent card, in the claim flow's card
// pattern (the placement discipline of components/
// GiftClaimPage.tsx — the card's heading is the page's
// h1, the form is the kit's standard field block:
// label, input and button stacked, not the sample's
// side-by-side row).
//
// Copy is lib/download.ts's constants — the samples'
// verbatim text. The sample's shelf notes ("Sample
// only — …") are not product copy and appear nowhere.
//
// The third state a link can land in — not genuine at
// all (view 35) — is not a card here: the landing page
// serves the site's single error page for it (the
// founder's one-page ruling), exactly as an unmatched
// route does.

function ClockIcon() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}

function RefundIcon() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
    </svg>
  );
}

function Badge({ form, children }: { form: "warn" | "ok"; children: ReactNode }) {
  return (
    <span className={`download-badge download-badge--${form}`} aria-hidden="true">
      {children}
    </span>
  );
}

export function DownloadPageShell({ children }: { children: ReactNode }) {
  return (
    <main className="site-pages download-page">
      <div className="site-pages__inner">
        <div className="download-wrap">{children}</div>
      </div>
    </main>
  );
}

// The re-issue form both cards carry — the same form,
// posting to the same route, so the sent card's "enter
// it again" is the expired card's form standing again,
// not a second mechanism. noValidate for the gift
// form's reason: the flow's own rules judge an address
// (here, by simply never matching a malformed one), and
// the browser's native bubble must not intercept an
// entry before the uniform answer can stand.
function ReissueForm({ token, finePrint }: { token: string; finePrint?: string }) {
  return (
    <form method="post" action={downloadReissuePostPath(token)} noValidate>
      <TextField
        id="download-email"
        name="email"
        type="email"
        autoComplete="email"
        label={DOWNLOAD_EMAIL_LABEL}
        required
      />
      <Button type="submit">{DOWNLOAD_REISSUE_BUTTON}</Button>
      {finePrint && <p className="download-fine-print">{finePrint}</p>}
    </form>
  );
}

// View 32 — the expired link: the link has run out,
// the report has not, and the way back is the
// delivery's own inbox.
export function DownloadExpiredCard({ token }: { token: string }) {
  return (
    <div className="card download-card">
      <Badge form="warn">
        <ClockIcon />
      </Badge>
      <h1>{DOWNLOAD_EXPIRED_HEADING}</h1>
      <p>{DOWNLOAD_EXPIRED_BODY}</p>
      <ReissueForm token={token} finePrint={DOWNLOAD_EXPIRED_FINE_PRINT} />
    </div>
  );
}

// View 33 — the uniform answer: this exact card stands
// whether the address matched a report or not, so the
// screen itself never reveals who bought what. The
// form stands again under it for the wrong-address
// case the body names.
export function DownloadSentCard({ token }: { token: string }) {
  return (
    <div className="card download-card">
      <Badge form="ok">
        <MailIcon />
      </Badge>
      <h1>{DOWNLOAD_SENT_HEADING}</h1>
      <p>{DOWNLOAD_SENT_BODY}</p>
      <p>{DOWNLOAD_SENT_AGAIN_LINE}</p>
      <ReissueForm token={token} />
    </div>
  );
}

// The refunded delivery (M9.8) — DRAFT copy from the
// M9.8 draft samples (outside the Final Sample
// Master): the expired card's frame, but no form under
// it — no fresh link can be sent for a refunded order,
// and a form here would promise a recovery that must
// not happen. It stands for genuine links in date and
// expired alike: the withdrawal, not the link's own
// age, is the fact.
export function DownloadRefundedCard() {
  return (
    <div className="card download-card">
      <Badge form="warn">
        <RefundIcon />
      </Badge>
      <h1>{DOWNLOAD_REFUNDED_HEADING}</h1>
      <p>{DOWNLOAD_REFUNDED_BODY}</p>
    </div>
  );
}
