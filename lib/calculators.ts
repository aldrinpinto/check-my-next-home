// The results-page calculators (M7.10 as amended, landing
// in the fold-in build): pure arithmetic, pinned by
// tests/calculators.test.ts (T-WEB-12). Nothing typed into
// the calculators is stored, and no asking price is ever
// read or pre-filled — the pre-fill is the home's own last
// recorded sale price, from the served sold-prices facts.

export const CALCULATORS_HEADING = "Could this home fit your life?";
export const CALCULATORS_INTRO =
  "Try your deposit and your years against this home's price, and watch the monthly figure move.";

export const MORTGAGE_DEFAULT_DEPOSIT_PCT = 25;
export const MORTGAGE_DEFAULT_RATE_PCT = 4.5;
export const MORTGAGE_DEFAULT_TERM_YEARS = 25;

export interface MortgageResult {
  loan: number;
  monthly: number;
  sentence: string;
}

// Standard repayment (annuity) formula. A zero rate falls
// back to a straight division; non-positive inputs yield a
// zero result rather than a NaN the page could render.
// BUG-262 (founder ruling, 24 Nov 2026): NO ROUNDING —
// the monthly figure is shown to the penny (£1,000.50 on
// £180,000 at 4.5% over 25 years), never rounded to whole
// pounds. The sentence always carries two decimals.
export function mortgageMonthly(
  price: number,
  deposit: number,
  ratePct: number,
  years: number,
): MortgageResult {
  const loan = Math.max(0, Math.round(price - deposit));
  const months = Math.max(0, Math.round(years * 12));
  if (loan === 0 || months === 0) return { loan, monthly: 0, sentence: "" };
  const r = ratePct / 100 / 12;
  const raw = r === 0 ? loan / months : (loan * r) / (1 - Math.pow(1 + r, -months));
  const monthly = Math.round(raw * 100) / 100;
  const monthlyText = monthly.toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return {
    loan,
    monthly,
    sentence: `On a loan of £${loan.toLocaleString("en-GB")} (£${Math.round(price).toLocaleString("en-GB")} price less £${Math.round(deposit).toLocaleString("en-GB")} deposit) at ${ratePct}% over ${years} years: £${monthlyText} a month, repayment.`,
  };
}

export function defaultDeposit(price: number): number {
  return Math.round((price * MORTGAGE_DEFAULT_DEPOSIT_PCT) / 100);
}

// Stamp duty (England & Northern Ireland rates from
// 1 April 2025 — GOV.UK). Standard bands: 0% to £250,000;
// 5% to £925,000; 10% to £1,500,000; 12% above.
// First-time-buyer relief: 0% to £300,000 and 5%
// from £300,000 to £500,000 — only up to £500,000; above
// that the standard rates apply. The additional-home
// rates add 5% to each band.
export type BuyerKind = "first" | "moving" | "additional";

export const BUYER_CHOICES: { key: BuyerKind; label: string }[] = [
  { key: "first", label: "Our first home" },
  { key: "moving", label: "Moving from our home" },
  { key: "additional", label: "Buying another home as well" },
];

const STANDARD_BANDS: { upTo: number; rate: number }[] = [
  { upTo: 250_000, rate: 0 },
  { upTo: 925_000, rate: 0.05 },
  { upTo: 1_500_000, rate: 0.1 },
  { upTo: Infinity, rate: 0.12 },
];

const FIRST_TIME_BANDS: { upTo: number; rate: number }[] = [
  { upTo: 300_000, rate: 0 },
  { upTo: 500_000, rate: 0.05 },
];

function bandedDuty(price: number, bands: { upTo: number; rate: number }[], surcharge = 0): number {
  let duty = 0;
  let prev = 0;
  for (const band of bands) {
    if (price <= prev) break;
    const slice = Math.min(price, band.upTo) - prev;
    if (slice > 0) duty += slice * (band.rate + surcharge);
    prev = band.upTo;
  }
  return duty;
}

export function stampDuty(price: number, buyer: BuyerKind): number {
  if (!(price > 0)) return 0;
  if (buyer === "additional") return Math.round(bandedDuty(price, STANDARD_BANDS, 0.05));
  if (buyer === "first" && price <= 500_000) return Math.round(bandedDuty(price, FIRST_TIME_BANDS));
  return Math.round(bandedDuty(price, STANDARD_BANDS));
}

export const STAMP_DUTY_RATES_LINE = "England & Northern Ireland rates from 1 April 2025 — GOV.UK";
export const STAMP_DUTY_RATES_URL = "https://www.gov.uk/stamp-duty-land-tax";
export const STAMP_DUTY_SMALL_PRINT =
  "First-time-buyer relief applies only up to £500,000; above that the standard rates apply. The additional-home rates add 5% to each band. Illustration only — not advice.";
export const MORTGAGE_SMALL_PRINT =
  "Illustration only, on the rate and term you entered — rates change, and this is not advice and not a verdict on what you can afford.";

export const EMPTY_PRICE_PROMPT = "Enter the price you're considering.";

export function stampDutyFraming(lastSalePrice: number | null, duty: number): string {
  if (lastSalePrice === null) return EMPTY_PRICE_PROMPT;
  return `On the price this home last sold for, the stamp duty would be £${duty.toLocaleString("en-GB")} — put in the price you'd actually offer, and it moves with you.`;
}

// The deposit as a share of the price (M7.10 G5): display
// only, derived from the two figures currently in the
// boxes — it never feeds the arithmetic. Nothing shows
// when either figure is not a positive number.
export function depositShareLine(price: number, deposit: number): string | null {
  if (!(price > 0) || !(deposit > 0)) return null;
  return `${Math.round((deposit / price) * 100)}% of the price`;
}

// Nation forms for the stamp duty card (M7.10 G1, founder
// ruling 18 Nov 2026): Scotland and Wales charge their own
// taxes, so the SDLT calculation is replaced by a named
// line in the D30 pattern plus the official source — no
// figures are served for either nation. The URLs are the
// authorities' own pages, verified 18 Nov 2026: Revenue
// Scotland's residential LBTT page, and GOV.WALES's Land
// Transaction Tax guide (the Welsh Revenue Authority's tax,
// published on GOV.WALES).
export const SCOTLAND_TAX_LINE =
  "Scotland charges Land and Buildings Transaction Tax instead — this calculator covers England & Northern Ireland.";
export const SCOTLAND_TAX_LINK = {
  label: "Land and Buildings Transaction Tax — Revenue Scotland",
  url: "https://revenue.scot/taxes/land-buildings-transaction-tax/residential-property",
};
export const WALES_TAX_LINE =
  "Wales charges Land Transaction Tax instead — this calculator covers England & Northern Ireland.";
export const WALES_TAX_LINK = {
  label: "Land Transaction Tax — GOV.WALES",
  url: "https://www.gov.wales/land-transaction-tax-guide",
};

// The report's Welsh line (founder ruling 23 Nov 2026,
// the M8.10 build's conform flag): the line above
// speaks as a calculator because on the calculator
// card it is one; the report is not a calculator, so
// its worked-figure block names the tax in Land
// Transaction Tax's own framing and says plainly why
// no stamp duty figure stands for the home. Scotland's
// report line takes the same change later, with the
// Scotland work (M14, LBTT); until then the report
// carries SCOTLAND_TAX_LINE as composed above.
export const WALES_TAX_LINE_REPORT =
  "Wales charges Land Transaction Tax instead of stamp duty, so no stamp duty figure is worked for this home.";
