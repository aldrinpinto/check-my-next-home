// The accepted-brand marks for the payment page's
// method rows (founder, 25 Nov 2026): the four card
// brands on the Card row, the Revolut mark on the
// Revolut Pay row — shown from the start, before any
// email or consent input, so the rows read as payment
// at first sight (the standard checkout pattern:
// Stripe Checkout, Shopify and Amazon all show the
// brand marks on the method rows upfront).
//
// The marks are inline SVG, not images: the codebase
// holds no card-brand assets, and nothing is hotlinked
// — each mark is a simplified rendering of the
// brand's own mark (Visa's white italic wordmark on
// its blue; Mastercard's overlapping circles;
// Amex's white wordmark on its blue; Discover's black
// wordmark with its orange ball; Revolut's white R in
// its black rounded square), drawn at the card ratio
// (38x24) except Revolut's square (24x24).
//
// The marks are decorative: the row's text label
// ("Card", "Revolut Pay") carries the meaning, so
// each svg is aria-hidden with no title. (The
// wordmarks' <text> still counts toward the row's
// textContent, which is why the tests pin the label
// span — tests/report-payment.test.ts,
// e2e/report-door.e2e.ts — rather than the row.)

function brandSvgProps(brand: string) {
  return {
    "data-brand": brand,
    "aria-hidden": true,
    focusable: false as const,
  };
}

export function VisaMark() {
  return (
    <svg viewBox="0 0 38 24" {...brandSvgProps("visa")}>
      <rect width="38" height="24" rx="4" fill="#1A1F71" />
      <text
        x="19"
        y="16.5"
        textAnchor="middle"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="11"
        fontWeight="700"
        fontStyle="italic"
        letterSpacing="0.5"
        fill="#fff"
      >
        VISA
      </text>
    </svg>
  );
}

export function MastercardMark() {
  return (
    <svg viewBox="0 0 38 24" {...brandSvgProps("mastercard")}>
      <circle cx="15" cy="12" r="7.5" fill="#EB001B" />
      <circle cx="23" cy="12" r="7.5" fill="#F79E1B" fillOpacity="0.85" />
    </svg>
  );
}

export function AmexMark() {
  return (
    <svg viewBox="0 0 38 24" {...brandSvgProps("amex")}>
      <rect width="38" height="24" rx="4" fill="#2E77BC" />
      <text
        x="19"
        y="15.5"
        textAnchor="middle"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="8"
        fontWeight="700"
        letterSpacing="0.5"
        fill="#fff"
      >
        AMEX
      </text>
    </svg>
  );
}

export function DiscoverMark() {
  return (
    <svg viewBox="0 0 44 24" {...brandSvgProps("discover")}>
      <rect width="44" height="24" rx="4" fill="#fff" stroke="#E3DCC4" />
      <text
        x="19"
        y="15.5"
        textAnchor="middle"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="7"
        fontWeight="700"
        letterSpacing="0.2"
        fill="#1A1A1A"
      >
        DISCOVER
      </text>
      <circle cx="38" cy="12" r="3.2" fill="#F48120" />
    </svg>
  );
}

export function RevolutMark() {
  return (
    <svg viewBox="0 0 24 24" {...brandSvgProps("revolut")}>
      <rect width="24" height="24" rx="5" fill="#000" />
      <text
        x="12"
        y="16.5"
        textAnchor="middle"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="13"
        fontWeight="700"
        fill="#fff"
      >
        R
      </text>
    </svg>
  );
}
