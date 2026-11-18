import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import Calculators from "../components/Calculators";
import {
  EMPTY_PRICE_PROMPT,
  SCOTLAND_TAX_LINE,
  SCOTLAND_TAX_LINK,
  WALES_TAX_LINE,
  WALES_TAX_LINK,
  defaultDeposit,
  depositShareLine,
  mortgageMonthly,
  stampDuty,
  stampDutyFraming,
} from "../lib/calculators";

// T-WEB-12 (M7.10 as amended, fold-in build): the mortgage
// and stamp duty calculators — pre-fill from the home's own
// last recorded sale price, the pinned sample figures, the
// buyer-kind bands, and the no-sale framing.

describe("calculators — mortgage (T-WEB-12)", () => {
  it("the Birkdale sample figures: £588,995 price, 25% deposit, £2,455 a month on a £441,746 loan at 4.5% over 25 years", () => {
    expect(defaultDeposit(588995)).toBe(147249);
    const result = mortgageMonthly(588995, 147249, 4.5, 25);
    expect(result.loan).toBe(441746);
    expect(result.monthly).toBe(2455);
    expect(result.sentence).toBe(
      "On a loan of £441,746 (£588,995 price less £147,249 deposit) at 4.5% over 25 years: £2,455 a month, repayment.",
    );
  });

  it("a zero rate divides straight; zero inputs never produce NaN", () => {
    expect(mortgageMonthly(120000, 20000, 0, 10).monthly).toBe(833);
    expect(mortgageMonthly(0, 0, 4.5, 25).monthly).toBe(0);
  });
});

describe("calculators — stamp duty (T-WEB-12)", () => {
  it("the Birkdale sample: £19,450 on £588,995 for a mover", () => {
    expect(stampDuty(588995, "moving")).toBe(19450);
  });

  it("first-time-buyer relief applies only up to £500,000", () => {
    expect(stampDuty(400000, "first")).toBe(5000);
    expect(stampDuty(600000, "first")).toBe(stampDuty(600000, "moving"));
  });

  it("the additional-home rates add 5% to each band", () => {
    expect(stampDuty(588995, "additional")).toBe(48900);
  });

  it("the framing lines: with a last sale, and without one (the box starts empty)", () => {
    expect(stampDutyFraming(588995, 19450)).toBe(
      "On the price this home last sold for, the stamp duty would be £19,450 — put in the price you'd actually offer, and it moves with you.",
    );
    expect(stampDutyFraming(null, 0)).toBe("Enter the price you're considering.");
  });
});

describe("calculators — M7.10 fold-ins (G1/G4/G5)", () => {
  it("G4: the empty-price prompt is the step's existing line, shared by the framing and both Calculate handlers", () => {
    expect(EMPTY_PRICE_PROMPT).toBe("Enter the price you're considering.");
    expect(stampDutyFraming(null, 0)).toBe(EMPTY_PRICE_PROMPT);
  });

  it("G5: the deposit share is derived from the current figures, and shows nothing without two positive numbers", () => {
    expect(depositShareLine(588995, 147249)).toBe("25% of the price");
    expect(depositShareLine(300000, 30000)).toBe("10% of the price");
    expect(depositShareLine(0, 100)).toBeNull();
    expect(depositShareLine(300000, 0)).toBeNull();
    expect(depositShareLine(0, 0)).toBeNull();
  });

  it("G1: the Scotland form names LBTT, serves no SDLT figure, and links Revenue Scotland", () => {
    expect(SCOTLAND_TAX_LINE).toBe(
      "Scotland charges Land and Buildings Transaction Tax instead — this calculator covers England & Northern Ireland.",
    );
    expect(SCOTLAND_TAX_LINK.url).toBe(
      "https://revenue.scot/taxes/land-buildings-transaction-tax/residential-property",
    );
    expect(SCOTLAND_TAX_LINK.label).toContain("Revenue Scotland");
  });

  it("G1: the Wales form names LTT, serves no SDLT figure, and links GOV.WALES", () => {
    expect(WALES_TAX_LINE).toBe(
      "Wales charges Land Transaction Tax instead — this calculator covers England & Northern Ireland.",
    );
    expect(WALES_TAX_LINK.url).toBe("https://www.gov.wales/land-transaction-tax-guide");
    expect(WALES_TAX_LINK.label).toContain("GOV.WALES");
  });
});

describe("calculators — the rendered cards (G1/G3/G5)", () => {
  const render = (props: Parameters<typeof Calculators>[0]) =>
    renderToStaticMarkup(createElement(Calculators, props));

  it("G3: the England form renders every input through the kit's field classes and the buttons through the kit's button", () => {
    const html = render({ lastSalePrice: 588995, nation: "england" });
    // Five labelled inputs (price, deposit, rate, term,
    // stamp duty price), each a .field__input inside a
    // .field; the radios are NOT field inputs.
    expect(html.match(/field__input/g)).toHaveLength(5);
    expect(html).toContain('class="field"');
    expect(html).toContain('class="btn btn--primary"');
    expect(html).toContain("Calculate monthly payment");
    expect(html).toContain("Calculate stamp duty");
    // Pre-fill from the home's last sale, both cards.
    expect(html).toContain('value="588995"');
    expect(html).toContain('value="147249"');
  });

  it("G5: the Birkdale pre-fill shows the deposit's share beside the deposit box", () => {
    const html = render({ lastSalePrice: 588995, nation: "england" });
    expect(html).toContain("25% of the price");
    // The no-sale start shows no share (nothing is a
    // positive number yet).
    const empty = render({ lastSalePrice: null, nation: "england" });
    expect(empty).not.toContain("of the price");
  });

  it("G1: Scotland replaces the stamp duty calculation with the LBTT named line; the mortgage card is untouched", () => {
    const html = render({ lastSalePrice: 300000, nation: "scotland" });
    expect(html).toContain(SCOTLAND_TAX_LINE.replace(/&/g, "&amp;"));
    expect(html).toContain(`href="${SCOTLAND_TAX_LINK.url}"`);
    expect(html).not.toContain("Calculate stamp duty");
    expect(html).not.toContain("Which sounds like you?");
    expect(html).not.toContain("First-time-buyer relief applies only up to £500,000");
    expect(html).toContain("Mortgage calculator");
    expect(html).toContain("Calculate monthly payment");
  });

  it("G1: Wales replaces the stamp duty calculation with the LTT named line", () => {
    const html = render({ lastSalePrice: 300000, nation: "wales" });
    expect(html).toContain(WALES_TAX_LINE.replace(/&/g, "&amp;"));
    expect(html).toContain(`href="${WALES_TAX_LINK.url}"`);
    expect(html).not.toContain("Calculate stamp duty");
    expect(html).toContain("Calculate monthly payment");
  });

  it("G1: Northern Ireland and an unknown nation keep the SDLT calculator exactly as-is", () => {
    for (const nation of ["northern-ireland", "unknown", undefined] as const) {
      const html = render({ lastSalePrice: 588995, nation });
      expect(html).toContain("Calculate stamp duty");
      expect(html).toContain("England &amp; Northern Ireland rates from 1 April 2025");
    }
  });
});
