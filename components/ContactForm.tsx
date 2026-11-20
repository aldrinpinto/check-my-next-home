import {
  CONTACT_EMAIL_ERROR,
  CONTACT_EMAIL_LABEL,
  CONTACT_EMAIL_PLACEHOLDER,
  CONTACT_MESSAGE_ERROR,
  CONTACT_MESSAGE_LABEL,
  CONTACT_MESSAGE_PLACEHOLDER,
  CONTACT_MESSAGE_TOO_LONG_ERROR,
  CONTACT_NAME_ERROR,
  CONTACT_NAME_LABEL,
  CONTACT_NAME_PLACEHOLDER,
  CONTACT_SEND_FAILED_LINE,
  CONTACT_SEND_LABEL,
  CONTACT_THANKS,
} from "../lib/site-pages";
import { contactSendPath, type ContactErrorField, type ContactInput } from "../lib/contact";

// M7.8 — the Contact sample's form (Final Sample Master
// view 6): name, email, message, Send — and the sample's
// thank-you state on submit. As first built the thanks
// showed client-side and the submission went nowhere:
// no delivery endpoint existed (BUG-028).
//
// BUG-028 fix (founder ruling 19 Nov 2026 — wire real
// delivery and keep the words): the form is now a plain
// server form posting to /contact/send, in the gift
// claim form's dress. The route stores the message
// (migration 0037) and only then answers ?sent=1, which
// is the one state that renders CONTACT_THANKS — the
// words themselves are unchanged, and they are now
// true. The page passes the states down:
//   errors     — the refused fields; each field's line
//                stands under it (the claim form's
//                inline-error manner), and the typed
//                values stand in the fields.
//   sendFailed — the save failed: the failure line
//                stands over the form, the typed values
//                stand in the fields, and the thanks is
//                never rendered on this state.
//   sent       — the thanks block under the (empty)
//                form, exactly the sample's dress.
export default function ContactForm({
  values,
  errors,
  sendFailed,
  sent,
}: {
  values?: ContactInput;
  errors?: readonly ContactErrorField[];
  sendFailed?: boolean;
  sent?: boolean;
}) {
  const errorFor = (field: ContactErrorField): string | undefined =>
    errors?.includes(field) ? field : undefined;
  const nameError = errorFor("name") ? CONTACT_NAME_ERROR : undefined;
  const emailError = errorFor("email") ? CONTACT_EMAIL_ERROR : undefined;
  const messageError = errorFor("message-long")
    ? CONTACT_MESSAGE_TOO_LONG_ERROR
    : errorFor("message")
      ? CONTACT_MESSAGE_ERROR
      : undefined;

  return (
    <>
      {sendFailed && (
        <p className="contact-alert" role="alert">
          {CONTACT_SEND_FAILED_LINE}
        </p>
      )}
      {/* noValidate: the server's own validation is the
          one judge of the fields (its inline errors are
          the answer) — the browser's native bubbles must
          not intercept an entry before the server can
          refuse it in the designed form. The claim form
          carries noValidate for the same reason. */}
      <form method="post" action={contactSendPath()} noValidate>
        <div>
          <label htmlFor="cf-name">{CONTACT_NAME_LABEL}</label>
          <input
            type="text"
            id="cf-name"
            name="name"
            autoComplete="name"
            placeholder={CONTACT_NAME_PLACEHOLDER}
            defaultValue={values?.name}
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? "cf-name-error" : undefined}
          />
          {nameError && (
            <p className="contact-field-error" id="cf-name-error" role="alert">
              {nameError}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="cf-email">{CONTACT_EMAIL_LABEL}</label>
          <input
            type="email"
            id="cf-email"
            name="email"
            autoComplete="email"
            placeholder={CONTACT_EMAIL_PLACEHOLDER}
            defaultValue={values?.email}
            aria-invalid={emailError ? true : undefined}
            aria-describedby={emailError ? "cf-email-error" : undefined}
          />
          {emailError && (
            <p className="contact-field-error" id="cf-email-error" role="alert">
              {emailError}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="cf-message">{CONTACT_MESSAGE_LABEL}</label>
          <textarea
            id="cf-message"
            name="message"
            placeholder={CONTACT_MESSAGE_PLACEHOLDER}
            defaultValue={values?.message}
            aria-invalid={messageError ? true : undefined}
            aria-describedby={messageError ? "cf-message-error" : undefined}
          />
          {messageError && (
            <p className="contact-field-error" id="cf-message-error" role="alert">
              {messageError}
            </p>
          )}
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
    </>
  );
}
