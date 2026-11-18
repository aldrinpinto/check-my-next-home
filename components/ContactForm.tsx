"use client";

import { useState, type FormEvent } from "react";

import {
  CONTACT_EMAIL_LABEL,
  CONTACT_EMAIL_PLACEHOLDER,
  CONTACT_MESSAGE_LABEL,
  CONTACT_MESSAGE_PLACEHOLDER,
  CONTACT_NAME_LABEL,
  CONTACT_NAME_PLACEHOLDER,
  CONTACT_SEND_LABEL,
  CONTACT_THANKS,
} from "../lib/site-pages";

// M7.8 — the Contact sample's form (Final Sample Master
// view 6): name, email, message, Send — and the sample's
// thank-you state on submit. The form carries the sample's
// behaviour exactly as finalised; no delivery endpoint
// exists in the product yet, so a submission shows the
// thank-you state client-side and sends nothing anywhere —
// the mailto route beside the form is the working route
// today. Wiring real delivery is a later step's work; the
// gap is recorded in this step's build note, not hidden.
export default function ContactForm() {
  const [sent, setSent] = useState(false);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSent(true);
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <div>
        <label htmlFor="cf-name">{CONTACT_NAME_LABEL}</label>
        <input
          type="text"
          id="cf-name"
          name="name"
          autoComplete="name"
          placeholder={CONTACT_NAME_PLACEHOLDER}
        />
      </div>
      <div>
        <label htmlFor="cf-email">{CONTACT_EMAIL_LABEL}</label>
        <input
          type="email"
          id="cf-email"
          name="email"
          autoComplete="email"
          placeholder={CONTACT_EMAIL_PLACEHOLDER}
        />
      </div>
      <div>
        <label htmlFor="cf-message">{CONTACT_MESSAGE_LABEL}</label>
        <textarea id="cf-message" name="message" placeholder={CONTACT_MESSAGE_PLACEHOLDER} />
      </div>
      <button type="submit" className="send-btn">
        {CONTACT_SEND_LABEL}
      </button>
      {sent && (
        <div className="thanks show" role="status">
          {CONTACT_THANKS}
        </div>
      )}
    </form>
  );
}
