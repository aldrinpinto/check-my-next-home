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
  const monthly = Math.round(raw);
  return {
    loan,
    monthly,
    sentence: `On a loan of £${loan.toLocaleString("en-GB")} (£${Math.round(price).toLocaleString("en-GB")} price less £${Math.round(deposit).toLocaleString("en-GB")} deposit) at ${ratePct}% over ${years} years: £${monthly.toLocaleString("en-GB")} a month, repayment.`,
  };
}

export function defaultDeposit(price: number): number {
  return Math.round((price * MORTGAGE_DEFAULT_DEPOSIT_PCT) / 100);
}

// Stamp duty (England & Northern Ireland rates from
// 1 April 2025 — GOV.UK). Standard bands: 0% to £125,000;
// 2% to £250,000; 5% to £925,000; 10% to £1,500,000; 12%
// above. First-time-buyer relief: 0% to £300,000 and 5%
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
  { upTo: 125_000, rate: 0 },
  { upTo: 250_000, rate: 0.02 },
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

export function stampDutyFraming(lastSalePrice: number | null, duty: number): string {
  if (lastSalePrice === null) return "Enter the price you're considering.";
  return `On the price this home last sold for, the stamp duty would be £${duty.toLocaleString("en-GB")} — put in the price you'd actually offer, and it moves with you.`;
}
