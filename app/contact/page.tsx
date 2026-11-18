import type { Metadata } from "next";

import BreadcrumbLd from "../../components/BreadcrumbLd";
import ContactForm from "../../components/ContactForm";
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
export const metadata: Metadata = pageMetadata({ ...PAGE_SEO["/contact"], path: "/contact" });

export default function ContactPage() {
  return (
    <main className="site-pages">
      <div className="site-pages__inner">
        <BreadcrumbLd name="Contact" path="/contact" />
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
            <ContactForm />
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
