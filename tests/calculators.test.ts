import { describe, expect, it } from "vitest";

import { defaultDeposit, mortgageMonthly, stampDuty, stampDutyFraming } from "../lib/calculators";

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
