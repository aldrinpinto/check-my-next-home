// M7.8 — the chrome pages' copy: How we check, About,
// Contact and Privacy. Transcribed faithfully from the
// finalised Final Sample Master views (4, 5, 6 and 8) —
// the samples are the authority for these pages; the words
// are theirs, carried here as constants so the pages render
// from one source and the wording can never drift between
// the sample and the site. (The Sample report, view 7, is a
// document, not prose constants: it is transcribed as
// components/SampleReport.tsx.)
//
// Because this copy is the founder-finalised samples'
// verbatim text — including their ruled negations ("No
// scores. No valuations. No recommendations.") — it is not
// re-run through the banned-wording scan: that scan governs
// copy drafted for the site (lib/seo.ts's locked pairs and
// lib/check-pages.ts's body copy), and ruled sample wording
// stands as ruled, the same standing the D9 short form has
// in the existing scans. Recorded in the step's build note.

export const HOW_WE_CHECK_EYEBROW = "How we check";
export const HOW_WE_CHECK_H1 = "Where every fact comes from";
export const HOW_WE_CHECK_LEAD =
  "Every fact on a check comes from an official source, shown with its source and date. We present the facts — the decision is yours.";
export const HOW_WE_CHECK_INTRO =
  "This page walks through each check in turn: what it shows, where it comes from, and how the figure is put together. Nothing here is estimated, modelled by us, or filled in by guesswork — if a source does not cover a home, the check says so.";

export type HowWeCheckCard = {
  icon: string;
  heading: string;
  source: string;
  paragraphs: string[];
  howLabel: string;
  howText: string;
};

export const HOW_WE_CHECK_CARDS: HowWeCheckCard[] = [
  {
    icon: "£",
    heading: "Sold prices",
    source: "Source · HM Land Registry",
    paragraphs: [
      "We show what homes near the one you are checking actually sold for, drawn from HM Land Registry's Price Paid Data — every recorded sale in England and Wales since 1995, with the price, the date and the type of home.",
    ],
    howLabel: "How the figure is produced:",
    howText:
      "where we show a typical price, it is the median — the middle sale — and we only show one when there are five or more sales to draw on. Fewer than that, and we list the sales themselves instead. Sold prices describe recorded sales only. They are a record of what was paid, never a valuation of the home you are looking at.",
  },
  {
    icon: "§",
    heading: "Crime",
    source: "Source · Police.uk",
    paragraphs: [
      "We show the incidents police recorded within about a mile of the home over the last 12 months, as published on Police.uk, broken down by type and by month so you can see the shape of it rather than a single bare number.",
    ],
    howLabel: "How the figure is produced:",
    howText:
      "alongside the count, we set the rate per 1,000 residents next to the same rate for England as a whole, built from Census populations — so a busy town centre and a quiet village are compared fairly. One thing worth knowing: incidents are recorded against streets, not houses, so a pin on a street is where an incident was recorded, not necessarily the exact spot it happened.",
  },
  {
    icon: "≈",
    heading: "Flood",
    source: "Source · Environment Agency",
    paragraphs: [
      "Flood risk is shown as three separate pictures, because they describe three different things: the Environment Agency's flood zones for rivers and the sea, its surface-water maps for heavy rain, and its record of flood defences nearby. We never merge them into a single answer — a home can sit in one picture and not the others.",
    ],
    howLabel: "How it is gathered:",
    howText:
      "the maps come from the Agency's published data. Live flood warnings are different: they are fetched at the moment of the check, shown as they stand right then, and never stored — a warning is about today, not about the home's history.",
  },
  {
    icon: "Aa",
    heading: "Schools & nurseries",
    source: "Source · DfE & Ofsted",
    paragraphs: [
      "We list the schools and nurseries near the home, with their distance, their phase and admissions basis, and their Ofsted outcome. The school details come from the Department for Education's Get Information About Schools register, and the Ofsted outcomes are shown exactly as Ofsted published them — in their words, with their dates.",
    ],
    howLabel: "How it is gathered:",
    howText:
      "straight from the two registers, unchanged. We do not combine outcomes, average them, or turn them into a judgement of our own.",
  },
  {
    icon: "+",
    heading: "Health",
    source: "Source · NHS & CQC",
    paragraphs: [
      "We show the GP practices, dentists, pharmacies and hospitals near the home from NHS listings, so you can see what care is close by and how far the nearest A&E department is. Where a hospital has a rating from the Care Quality Commission, we show it as the CQC published it.",
    ],
    howLabel: "How it is gathered:",
    howText:
      "from the NHS service listings and the CQC's own published ratings — we list and we quote; we do not assess care ourselves.",
  },
  {
    icon: "%",
    heading: "The neighbourhood in numbers",
    source: "Source · ONS Census 2021 · MHCLG",
    paragraphs: [
      "This is the Census picture of the area around the home: who lives there, the kinds of homes, how households own or rent, ages, ethnic groups and religions — the ONS Census 2021 tables, presented in the Census's own words and categories, exactly as published.",
    ],
    howLabel: "How the figure is produced:",
    howText:
      "the deprivation figure comes from the MHCLG Indices of Deprivation 2025 and is served as a decile — a position from 1 to 10 — never converted into a score. Census figures describe the wider area around a home, and we say which area each table covers.",
  },
  {
    // The tenth card (M7.12, founder ruling 18 Nov 2026):
    // added to the Final Sample Master's view 4 first, and
    // this constant conforms the product to it — the words
    // are the Master's, verbatim, as with the other nine.
    icon: "∿",
    heading: "Air quality & noise",
    source: "Source · Defra",
    paragraphs: [
      "We show the modelled air quality figures for the square kilometre around the home — nitrogen dioxide and fine particles — and the published noise bands for its point, for road, rail and airport, by day and by night. The two are shown separately, in the publisher's own words, and never merged into a single answer.",
    ],
    howLabel: "How the figures are produced:",
    howText:
      "both are modelled, not measured. The air figures are Defra's modelled background concentrations for the square; the noise bands come from Defra's strategic noise mapping, modelled across the area. Neither is a reading taken at the home itself, and the check never turns them into a verdict on how a home will sound.",
  },
  {
    icon: "¤",
    heading: "Costs",
    source: "Source · MHCLG · EPC register · Ofcom",
    paragraphs: [
      "Three running costs, each from its own official home. Council tax comes from MHCLG figures and we show every band, A to H, for the home's council — not just the band the home sits in. Energy comes from the home's own EPC certificate on the register: its rating and its estimated running cost are the certificate's, for that home. Broadband and mobile coverage come from Ofcom's Connected Nations data.",
    ],
    howLabel: "How it is gathered:",
    howText:
      "each figure is the published one for that home or that council, shown with its source. Where a home has no EPC on the register, the check says so rather than estimating one.",
  },
  {
    icon: "¶",
    heading: "Planning, protection & ownership",
    source: "Source · planning.data.gov.uk & others",
    paragraphs: [
      "We check whether the home sits in a conservation area, under an Article 4 direction, or in the green belt, using planning.data.gov.uk, and whether it falls inside a built-up area using the ONS's built-up area boundaries. Listed buildings come from Historic England's National Heritage List for England, and nature designations — sites protected for wildlife and landscape — from Natural England. Where a home is owned by a company, that comes from HM Land Registry's company ownership data.",
    ],
    howLabel: "One honest gap:",
    howText:
      "planning applications. There is no national dataset of them, so we do not pretend otherwise — the check hands you to the council's own planning register, where applications near the home can be seen in full.",
  },
  {
    icon: "◎",
    heading: "What's nearby",
    source: "Source · OpenStreetMap · OS Greenspace",
    paragraphs: [
      "The everyday geography of a home: parks and green spaces, shops, stations, places of worship, leisure and the rest, drawn from OpenStreetMap and OS Greenspace data.",
    ],
    howLabel: "How distances are measured:",
    howText:
      "every distance on the site is straight-line — as the crow flies — from the home to the place. Walking and driving routes will usually be a little longer, and we say so wherever a distance appears.",
  },
];

export const NEVER_HEADING = "What we never do";
export const NEVER_INTRO =
  "A check is a page of facts, and it stays that way. Four things you will never find here:";
export const NEVER_ITEMS = [
  {
    heading: "No scores",
    text: "No home and no area is ever given a score, a rating or a mark out of anything.",
  },
  {
    heading: "No valuations",
    text: "Sold prices are a record of what was paid. We never say what a home is worth.",
  },
  {
    heading: "No recommendations",
    text: "We never tell you a home or an area is right for your family — that judgement is yours.",
  },
  {
    heading: "No guessing",
    text: "Where a source does not cover a place, the check says so plainly instead of filling the gap.",
  },
] as const;

// The search block that closes the How we check and About
// samples — heading, line, and the bare postcode box.
export const SEARCH_BLOCK_HEADING = "Check a home";
export const SEARCH_BLOCK_LINE =
  "Type a postcode and see the facts for yourself — the headlines are always free.";

export const ABOUT_EYEBROW = "About";
export const ABOUT_H1 = "A house is bricks. A home is family.";
export const ABOUT_TAGLINE_LINE = "Check the house. Choose the home.";
export const ABOUT_LEAD =
  "For the family who'll live there — not just the buyer. A house purchase is usually talked about in prices and percentages. But the questions that decide whether a place becomes a home are family questions: the walk to school, the park at the end of the road, the doctor nearby, the feel of the street after dark. This site exists to answer those questions with facts.";

export type AboutCard = { heading: string; paragraphs: string[]; priceLine?: string };

export const ABOUT_CARDS: AboutCard[] = [
  {
    heading: "Why we made it",
    paragraphs: [
      "Check My Next Home is an independent project. It was built because moving home is a family decision that is usually made with half the facts: the listing shows the kitchen beautifully and says nothing about the flood map, the crime figures or the census street by street. All of that is published, officially — it was just never gathered onto one page, written for the people who will actually live there.",
    ],
  },
  {
    heading: "What it is",
    paragraphs: [
      "Type in a home, and you get one page of the facts that matter: what sold nearby, the schools, crime, flood, costs, the neighbourhood in numbers and what's around the corner. Every fact is drawn from an official source — Land Registry, the Census, Police.uk, the Environment Agency and others — and every fact is shown with its source and its date, so you can see where it came from and how fresh it is.",
    ],
  },
  {
    heading: "What it never does",
    paragraphs: [
      "No scores. No valuations. No recommendations. We never mark a home or an area out of ten, never say what a home is worth, and never tell a family where they should live. We present the facts, in plain language, and the decision stays with the family — where it belongs.",
    ],
  },
  {
    heading: "Built for families",
    paragraphs: [
      "The checks are the ones a family asks about. Schools and nurseries sit beside sold prices; the vet and the park sit beside the flood map — because a home is chosen by the people who will live there, not just by the buyer. For the family who'll live there — not just the buyer.",
    ],
  },
  {
    heading: "Your privacy",
    paragraphs: [
      "There is no account to open and nothing to sign up for. Your shortlist lives in your own browser, not on our computers, and what you type into the calculators never leaves the page. We never sell visitor data — the report pays for the site, not your attention.",
    ],
  },
  {
    heading: "What it costs",
    priceLine: "£4.99",
    paragraphs: [
      "The headlines are free — the first page of facts on any home costs nothing. The detailed report, with the full tables and the questions to ask the seller, is £4.99. There is no advertising on the site, and visitor data is never sold. The report pays for the site; your attention is not the product.",
    ],
  },
];

export const ABOUT_MANIFESTO_HEADING = "Facts first, family always";
export const ABOUT_MANIFESTO_TEXT =
  "Every check on this site follows the same promise: official sources only, shown with their dates, in words a family can use at the kitchen table. If a source does not cover a home, we say so. If a figure needs explaining, we explain it. And if the facts point two ways at once — a lovely street with a long drive to the hospital — we show both, and trust you with the weighing-up.";
export const ABOUT_MANIFESTO_CLOSING = "Check the house. Choose the home.";

export const CONTACT_EYEBROW = "Contact";
export const CONTACT_H1 = "Contact";
export const CONTACT_LEAD =
  "Questions, corrections, or something that looks off — we'd rather hear about it than not.";
export const CONTACT_NAME_LABEL = "Your name";
export const CONTACT_NAME_PLACEHOLDER = "e.g. Alex Morgan";
export const CONTACT_EMAIL_LABEL = "Your email";
export const CONTACT_EMAIL_PLACEHOLDER = "you@example.co.uk";
export const CONTACT_MESSAGE_LABEL = "Your message";
export const CONTACT_MESSAGE_PLACEHOLDER = "Tell us what you'd like to know, or what looks wrong…";
export const CONTACT_SEND_LABEL = "Send";
export const CONTACT_THANKS =
  "Thank you for writing to us — we've got your message. We reply within two working days.";
export const CONTACT_EMAIL_PROMPT = "Prefer email? Write to us at";
export const CONTACT_EMAIL_ADDRESS = "contact@checkmynexthome.co.uk";
export const CONTACT_REPLY_PROMISE = "We reply within two working days.";

// The wired form's own lines (BUG-028 fix, founder
// ruling 19 Nov 2026 — real delivery wired behind the
// form, the words above kept). The field errors stand
// inline under their fields, in the gift claim form's
// manner; the email line is the site's one email error,
// word for word with the claim form's. The send-failure
// line mirrors the claim form's send-failed pattern: it
// names the failure, states plainly that nothing was
// received, and invites a retry — it is the ONLY state
// a failed save may show; the thanks above is reserved
// for a message actually stored (lib/server/contact.ts).
export const CONTACT_NAME_ERROR = "Enter your name";
export const CONTACT_EMAIL_ERROR = "Enter an email address, like you@example.co.uk";
export const CONTACT_MESSAGE_ERROR = "Enter your message";
export const CONTACT_MESSAGE_TOO_LONG_ERROR =
  "That message is too long — please keep it under 5,000 characters.";
export const CONTACT_SEND_FAILED_LINE =
  "We couldn't save your message just now — nothing has been received. Please try again.";
// The notification email's subject, composed by the
// mailer as "<this> from <the visitor's name>".
export const CONTACT_NOTIFICATION_SUBJECT = "Website contact message";

export const PRIVACY_EYEBROW = "Privacy policy";
export const PRIVACY_H1 = "Privacy policy";
export const PRIVACY_LEAD = "We collect as little as we can, and only what the site needs to work.";
export const PRIVACY_LEAD_REST =
  "This page explains, in plain English, what we hold, why we hold it, and what we never do with it.";
export const PRIVACY_DATE_LINE = "This version: 20 November 2026";
export const PRIVACY_EMAIL_ADDRESS = "privacy@checkmynexthome.co.uk";

// Privacy copy carries the sample's bold lead-ins as **…**
// markers inside the strings; the page's renderer turns
// them into <strong> and linkifies the privacy address.
export type PrivacyBlock = { kind: "p"; text: string } | { kind: "ul"; items: string[] };
export type PrivacyCard = { heading: string; blocks: PrivacyBlock[] };

const p = (text: string): PrivacyBlock => ({ kind: "p", text });
const ul = (items: string[]): PrivacyBlock => ({ kind: "ul", items });

export const PRIVACY_CARDS: PrivacyCard[] = [
  {
    heading: "Who we are",
    blocks: [
      p(
        "Check My Next Home is the site you are on now — a home checker that gathers the facts about a home from official sources onto one page.",
      ),
      p(
        "If you have a question about privacy, or about anything on this page, write to us at privacy@checkmynexthome.co.uk. That is the address to use for every privacy request below.",
      ),
    ],
  },
  {
    heading: "What we collect and why",
    blocks: [
      p("We only collect what a check or a purchase actually needs:"),
      ul([
        "**The postcode or address you check** — we use it to run the check and show you the facts for that home. Without it, there is nothing to check.",
        "**Your email address, only when you buy a report** — so we can deliver the report to you. If you only use the free headlines, we do not ask for an email address.",
        "**Your shortlist** — this lives in your own browser, on your own device. We cannot see which homes are on it. Our counting only learns that a home was added or removed — never which home.",
        "**Anything you type into the calculators** — the mortgage and stamp duty calculators work on the page itself. What you type never leaves the page and is never sent to us.",
        "**Messages you send us** — if you write to us on the Contact page, we keep your name, your email address and your message on our server, so we can read it and reply. The message is saved before anything else happens, so it reaches us even if the email alerting us to it does not.",
        "**Counting, kept at home** — we count how the site is used — which pages are opened, how many checks run, where people stop — with our own counting on our own server, plus Cloudflare Web Analytics for traffic. The counting never records the home or postcode you checked, your email, or anything that identifies you: it counts journeys, not people. No analytics company is involved, and counting sets no cookies.",
      ]),
      p("That is the whole list. There are no accounts on this site, and nothing to sign up for."),
    ],
  },
  {
    heading: "Payments",
    blocks: [
      p(
        "Card payments are handled by **Stripe**. When you pay for a report, you give your card details to Stripe, not to us.",
      ),
      p(
        "We never see your card details, and we never store them. Stripe confirms to us that a payment has been made so we can send your report — that confirmation is all we receive about the payment itself.",
      ),
    ],
  },
  {
    heading: "The services that process data for us",
    blocks: [
      p(
        "A small number of services handle data on our behalf, so the site can run. Each one only handles what its job needs:",
      ),
      ul([
        "**Stripe** — payments. Handles your card payment when you buy a report, as described above.",
        "**Resend** — sending email. Delivers your report, and any reply we send you, to your inbox.",
        "**Cloudflare** — hosting and security. Serves the site and helps keep it secure, including the invisible Turnstile check that keeps bots out. Turnstile runs in the background when you use the site — there is no box to tick.",
      ]),
      p("We use these services to run this site, and for no other purpose."),
    ],
  },
  {
    heading: "What we never do",
    blocks: [
      ul([
        "**We never sell visitor data.** Not to advertisers, not to anyone.",
        "**There are no accounts** and nothing to sign up for — no profiles, no passwords, no marketing lists to join.",
        "**Your attention is not the product.** The report pays for the site, not your attention — that is how the site is funded, and it is why we do not need your data for anything else.",
      ]),
    ],
  },
  {
    heading: "Cookies",
    blocks: [
      p("This site only uses the cookies it needs to work and to stay secure."),
      p(
        "We do not use cookies to follow you around the web, to build a profile of you, or to show you advertising.",
      ),
      p(
        "One more cookie appears if you arrive through a Check Together gift link. It remembers that the gift was claimed on this device, so your free report stays unlocked. It holds no personal details and is never used for counting or advertising.",
      ),
    ],
  },
  {
    heading: "Your rights",
    blocks: [
      p("What we hold about you is yours to ask about. At any time, you can:"),
      ul([
        "ask us what we hold about you;",
        "ask for it to be corrected, if anything is wrong;",
        "ask for it to be deleted.",
      ]),
      p("Write to privacy@checkmynexthome.co.uk and we will reply within **two working days**."),
    ],
  },
  {
    heading: "Changes to this policy",
    blocks: [
      p(
        "If this policy changes, the new version will appear on this page, with its date at the top — so the version you are reading is always the current one.",
      ),
      p(
        "If a change affects something you have already bought or asked us about, the policy that was on this page at the time is the one that applied to it.",
      ),
    ],
  },
];

// ----------------------------------------------------------------
// M9.4 — Terms of service. The step's build drafts the
// full text from the founder's adoption of 18 Nov 2026:
// what the report is and is not; the £4.99 purchase and
// delivery terms (PDF via the delivery email's signed
// link; reports are not stored on the website); the
// refund rules (a refund voids an unclaimed gift or a
// claimed-but-unused gift; a redeemed gift stands). The
// page is also the full-wording home of the D9 standing
// disclaimer — TERMS_D9_WORDING below carries it
// verbatim, and a test pins it equal to
// REPORT_DISCLAIMER_D9 (lib/report.ts) so the two homes
// of the wording can never drift apart. The founder
// approves the exact words before this build is pushed;
// the refund MECHANICS the words describe are M9.8's.

export const TERMS_EYEBROW = "Terms of service";
export const TERMS_H1 = "Terms of service";
export const TERMS_LEAD = "The detailed report costs £4.99, and these are the terms it is sold on.";
export const TERMS_LEAD_REST =
  "What the report is and is not, how it is delivered, and what happens if something goes wrong — in plain English.";
export const TERMS_DATE_LINE = "This version: 22 November 2026";
export const TERMS_EMAIL_ADDRESS = "contact@checkmynexthome.co.uk";

// D9's full standing wording, verbatim — the same words
// every report's closing block carries
// (REPORT_DISCLAIMER_D9 in lib/report.ts, pinned equal
// by tests/terms.test.ts).
export const TERMS_D9_WORDING =
  "We present official data as it is published, with its source and date. We do not score, rate or recommend homes or areas, and we do not interpret the data for you — what it means for your decision is your own judgement. Data can be wrong at source, out of date, or incomplete; before you rely on any figure, check it with the council, your solicitor, or the body that published it.";

export const TERMS_CARDS: PrivacyCard[] = [
  {
    heading: "What the report is",
    blocks: [
      p(
        "The detailed report gathers the facts about one home from official sources — HM Land Registry, the Census, Police.uk, the Environment Agency and others — into one dated document. Every fact is shown with its source and its date, so you can see where it came from and how fresh it is.",
      ),
      p(
        "The report is information, not advice. It is made for the home named in it, from the data published at the time it is made, and it is for you and your household's own use in deciding on that home.",
      ),
    ],
  },
  {
    heading: "What the report is not",
    blocks: [
      p(TERMS_D9_WORDING),
      p(
        "The report is not a survey, not a valuation, and not a substitute for your solicitor's searches and enquiries. It does not tell you whether to buy a home — that judgement is yours.",
      ),
    ],
  },
  {
    heading: "Buying a report",
    blocks: [
      p(
        "A report costs **£4.99** — one payment. There is no subscription, and nothing further to pay. The free check stays free in full: buying a report adds the detail behind the headlines, it never unlocks the headlines themselves.",
      ),
      p(
        "You pay on this website. Card payments are handled by **Stripe**: you give your card details to Stripe, not to us, and we never see or store them. Stripe confirms to us that a payment has been made, and that confirmation is what starts your report being made and sent.",
      ),
      p(
        "**Delivery is by email.** When your payment goes through, we make your report and email you a link to it as a PDF document. The link works for seven days; if it runs out, a fresh link can be sent to the same email address, free, whenever you need one — the report itself does not expire.",
      ),
      p(
        "Reports are not stored on the website, and there is no account to sign in to. Your delivery email is the way back to your report, so keep it.",
      ),
      p(
        "When you pay, you ask us to make and deliver your report straight away, and we start as soon as your payment goes through. Because the report is made for one named home and delivered digitally at your request, there is no cooling-off period once your report has been delivered.",
      ),
    ],
  },
  {
    heading: "The Check Together gift",
    blocks: [
      p(
        "Every paid report's delivery email carries a gift: a link someone else can use to get one detailed report of their own, free. The gift can be claimed once, within 30 days, by an email address different from the buyer's.",
      ),
      p(
        "A free report — claimed through a gift, or given in a free launch window — carries no gift of its own.",
      ),
    ],
  },
  {
    heading: "Refunds",
    blocks: [
      p(
        "If we cannot deliver your report, we refund the £4.99 in full, to the card you paid with — you do not need to ask.",
      ),
      p(
        "A refund voids the report's gift. If the gift has not been claimed, it stops working. If it has been claimed but the gifted report has not been used, the gifted report is withdrawn. A gift that has already been redeemed — the gifted report delivered — stands, and is not affected by the refund.",
      ),
      p(
        "If you believe a delivered report falls short of what these terms promise, write to us at contact@checkmynexthome.co.uk and tell us what is wrong. Where it does fall short, we will put it right or refund you.",
      ),
    ],
  },
  {
    heading: "Changes to these terms",
    blocks: [
      p(
        "If these terms change, the new version will appear on this page, with its date at the top. The terms on this page when you bought your report are the ones that apply to it.",
      ),
      p("Questions about these terms: write to us at contact@checkmynexthome.co.uk."),
    ],
  },
];
