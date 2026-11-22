import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// M9.4 — the step's Check, source half: "no card field
// exists anywhere in our pages". Card payments are the
// provider's embedded element — its fields live inside
// its cross-origin iframes — so no source file under
// app/ or components/ may carry a card input or a card
// autocomplete attribute. The drawn fields in Final
// Sample Master Sample 9 (Card number / Expiry / CVC /
// Name on card) are a picture of that element, and the
// tokens that would build them for real are banned
// here by name. (The rendered half of the Check — the
// email field and the consent tick-box (M9.5) are the
// only inputs in the payment page's own DOM — is
// tests/report-payment.test.ts.)

const BANNED_TOKENS = [
  "cc-number",
  "cc-exp",
  "cc-csc",
  "cc-name",
  'id="cardNumber"',
  'id="cardExp"',
  'id="cardCvc"',
  'id="cardName"',
  'name="cardNumber"',
  'name="cardExp"',
  'name="cardCvc"',
  'name="cardName"',
];

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...sourceFiles(path));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      found.push(path);
    }
  }
  return found;
}

describe("no card field exists anywhere in our pages (M9.4's Check, source half)", () => {
  it("no file under app/ or components/ carries a card input token", () => {
    const files = [...sourceFiles("app"), ...sourceFiles("components")];
    expect(files.length).toBeGreaterThan(0);
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const token of BANNED_TOKENS) {
        if (text.includes(token)) offenders.push(`${file}: ${token}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
