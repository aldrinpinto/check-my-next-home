import type { Metadata } from "next";
import { cookies } from "next/headers";

import Breadcrumb from "../../components/Breadcrumb";
import BreadcrumbLd from "../../components/BreadcrumbLd";
import ContactForm from "../../components/ContactForm";
import {
  CONTACT_ERROR_FIELDS,
  CONTACT_ENTRY_COOKIE_NAME,
  decodeContactEntry,
  type ContactErrorField,
} from "../../lib/contact";
import { PAGE_SEO, pageMetadata } from "../../lib/seo";
import {
  CONTACT_EMAIL_ADDRESS,
  CONTACT_EMAIL_PROMPT,
  CONTACT_EYEBROW,
  CONTACT_H1,
  CONTACT_LEAD,
  CONTACT_REPLY_PROMISE,
} from "../../lib/site-pages";

// M7.8 — Contact (Final Sample Master view 6): the form,
// the mailto route and the two-working-day promise, as
// finalised. Its locked pair is newly locked at /contact
// under the adopted scope ruling.
//
// BUG-028 fix (founder ruling 19 Nov 2026): the form is
// wired to real delivery (app/contact/send) and the page
// serves its states from the route's answers — ?sent=1
// (the thanks, served only for a stored message),
// ?sendfailed=1 (the failure line), ?error=<fields>
// (the inline errors). The entry flash is read for the
// error and send-failure presentations only — the
// cookie the send route set on its redirect, holding
// the values just typed, so the form stands filled
// under the error or failure line. It is read on no
// other presentation, never logged, and never counted.
export const metadata: Metadata = pageMetadata({ ...PAGE_SEO["/contact"], path: "/contact" });

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; sendfailed?: string; error?: string }>;
}) {
  const flags = await searchParams;
  const sendFailed = flags.sendfailed === "1";
  const errors: ContactErrorField[] =
    flags.error
      ?.split(",")
      .filter((token): token is ContactErrorField =>
        (CONTACT_ERROR_FIELDS as readonly string[]).includes(token),
      ) ?? [];
  const values =
    sendFailed || errors.length > 0
      ? decodeContactEntry((await cookies()).get(CONTACT_ENTRY_COOKIE_NAME)?.value)
      : undefined;

  return (
    <main className="site-pages">
      <div className="site-pages__inner">
        <BreadcrumbLd name="Contact" path="/contact" />
        <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Contact" }]} />
        {/* D5 (parity fix stack, 18 Nov 2026): the page
            sits in the sample's 720px .contact-wrap; the
            form keeps its card inside the wrap (the
            Master's own form), and the email route moves
            below the card as the sample's centred block —
            the address in Newsreader, the reply promise as
            a pill. */}
        <div className="contact-wrap">
          <p className="eyebrow">{CONTACT_EYEBROW}</p>
          <h1>{CONTACT_H1}</h1>
          <p className="lead">{CONTACT_LEAD}</p>
          <div className="rule" />

          <div className="card contact-card">
            <ContactForm
              values={values}
              errors={errors}
              sendFailed={sendFailed}
              sent={flags.sent === "1"}
            />
          </div>

          <div className="email-route">
            <p>{CONTACT_EMAIL_PROMPT}</p>
            <p>
              <a className="addr" href={`mailto:${CONTACT_EMAIL_ADDRESS}`}>
                {CONTACT_EMAIL_ADDRESS}
              </a>
            </p>
            <p>
              <span className="promise">{CONTACT_REPLY_PROMISE}</span>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
