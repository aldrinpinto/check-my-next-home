-- Migration 0037 — website contact messages (BUG-028
-- fix; founder ruling 19 Nov 2026: "wire real delivery
-- and keep the words").
--
-- The Contact form promised a receipt and a reply
-- (CONTACT_THANKS in lib/site-pages.ts) with nothing
-- behind it — no endpoint, no store, no delivery. This
-- table is the store the wired form saves into
-- (app/contact/send/route.ts via lib/server/contact.ts).
--
-- The honesty rule the table serves: a message counts
-- as RECEIVED when — and only when — its row is stored
-- here. The visitor's thank-you state is served only
-- after a successful insert; the notification email to
-- the contact inbox is a best-effort second step that
-- happens after storage and can never un-receive a
-- stored message (its failure is logged server-side,
-- never shown to the visitor as a failed receipt).
-- A failed insert shows the designed failure state
-- instead — nothing was received, and the page says so.
--
-- The length CHECKs mirror the form's own validation
-- caps in lib/contact.ts (name 100, email 254 — the
-- email shape check's cap — message 5,000): the two
-- move together or not at all, so a row the form would
-- refuse can never be written by any other path either.
-- The visitor's email is stored as entered-normalised
-- (trimmed, lower-cased — the site's one email rule,
-- lib/gift.ts's normaliseEmail, applied by the route
-- before the store is called).

CREATE TABLE contact_messages (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  email text NOT NULL CHECK (char_length(email) BETWEEN 3 AND 254),
  message text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 5000)
);
