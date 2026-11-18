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
        <p className="eyebrow">{CONTACT_EYEBROW}</p>
        <h1>{CONTACT_H1}</h1>
        <p className="lead">{CONTACT_LEAD}</p>
        <div className="rule" />

        <div className="card contact-card">
          <ContactForm />
          <p className="email-route">
            {CONTACT_EMAIL_PROMPT}{" "}
            <a href={`mailto:${CONTACT_EMAIL_ADDRESS}`}>{CONTACT_EMAIL_ADDRESS}</a>
            <br />
            {CONTACT_REPLY_PROMISE}
          </p>
        </div>
      </div>
    </main>
  );
}
