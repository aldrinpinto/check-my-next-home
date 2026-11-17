"use client";

import { useState } from "react";

import {
  BUYER_CHOICES,
  CALCULATORS_HEADING,
  CALCULATORS_INTRO,
  MORTGAGE_DEFAULT_RATE_PCT,
  MORTGAGE_DEFAULT_TERM_YEARS,
  MORTGAGE_SMALL_PRINT,
  STAMP_DUTY_RATES_LINE,
  STAMP_DUTY_RATES_URL,
  STAMP_DUTY_SMALL_PRINT,
  defaultDeposit,
  mortgageMonthly,
  stampDuty,
  stampDutyFraming,
  type BuyerKind,
} from "../lib/calculators";

// The "Could this home fit your life?" calculators
// (M7.10 as amended, fold-in build). Client island below
// the results tabs: pre-filled from the home's own last
// recorded sale price (never an asking price), always
// editable, and nothing typed here is stored or sent
// anywhere — the arithmetic is lib/calculators.ts, run in
// the page.

function num(value: string): number {
  const parsed = Number(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function Calculators({ lastSalePrice }: { lastSalePrice: number | null }) {
  const [price, setPrice] = useState(lastSalePrice ? String(lastSalePrice) : "");
  const [deposit, setDeposit] = useState(
    lastSalePrice ? String(defaultDeposit(lastSalePrice)) : "",
  );
  const [rate, setRate] = useState(String(MORTGAGE_DEFAULT_RATE_PCT));
  const [term, setTerm] = useState(String(MORTGAGE_DEFAULT_TERM_YEARS));
  const [mortgageSentence, setMortgageSentence] = useState<string | null>(null);

  const [sdPrice, setSdPrice] = useState(lastSalePrice ? String(lastSalePrice) : "");
  const [buyer, setBuyer] = useState<BuyerKind>("moving");
  const [sdSentence, setSdSentence] = useState<string | null>(null);

  const framingDuty = stampDuty(lastSalePrice ?? 0, "moving");

  return (
    <section className="calculators" aria-labelledby="calculators-heading">
      <h2 id="calculators-heading">{CALCULATORS_HEADING}</h2>
      <p className="calculators__intro">{CALCULATORS_INTRO}</p>
      <div className="calculators__cards">
        <div className="calculator-card">
          <h3>Mortgage calculator</h3>
          <p>
            A repayment illustration on the figures you enter — interest and capital, over the full
            term.
          </p>
          <label>
            Home price (£)
            <input inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} />
          </label>
          <label>
            Deposit (£)
            <input
              inputMode="numeric"
              value={deposit}
              onChange={(e) => setDeposit(e.target.value)}
            />
          </label>
          <label>
            Interest rate (% a year)
            <input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
          </label>
          <label>
            Term (years)
            <input inputMode="numeric" value={term} onChange={(e) => setTerm(e.target.value)} />
          </label>
          <button
            type="button"
            onClick={() =>
              setMortgageSentence(
                mortgageMonthly(num(price), num(deposit), num(rate), num(term)).sentence,
              )
            }
          >
            Calculate monthly payment
          </button>
          {mortgageSentence && <p className="calculator-card__result">{mortgageSentence}</p>}
          <p className="calculator-card__small">{MORTGAGE_SMALL_PRINT}</p>
        </div>
        <div className="calculator-card">
          <h3>Stamp duty calculator</h3>
          <p>{stampDutyFraming(lastSalePrice, framingDuty)}</p>
          <label>
            Purchase price (£)
            <input
              inputMode="numeric"
              value={sdPrice}
              onChange={(e) => setSdPrice(e.target.value)}
            />
          </label>
          <fieldset>
            <legend>Which sounds like you?</legend>
            {BUYER_CHOICES.map((choice) => (
              <label key={choice.key}>
                <input
                  type="radio"
                  name="buyer-kind"
                  value={choice.key}
                  checked={buyer === choice.key}
                  onChange={() => setBuyer(choice.key)}
                />{" "}
                {choice.label}
              </label>
            ))}
          </fieldset>
          <button
            type="button"
            onClick={() =>
              setSdSentence(
                `£${stampDuty(num(sdPrice), buyer).toLocaleString("en-GB")} on top of the price.`,
              )
            }
          >
            Calculate stamp duty
          </button>
          {sdSentence && <p className="calculator-card__result">{sdSentence}</p>}
          <p className="calculator-card__small">{STAMP_DUTY_SMALL_PRINT}</p>
          <p className="calculator-card__small">
            <a href={STAMP_DUTY_RATES_URL}>{STAMP_DUTY_RATES_LINE}</a>
          </p>
        </div>
      </div>
    </section>
  );
}
