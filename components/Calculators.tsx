"use client";

import { useState } from "react";

import {
  BUYER_CHOICES,
  CALCULATORS_HEADING,
  CALCULATORS_INTRO,
  EMPTY_PRICE_PROMPT,
  MORTGAGE_DEFAULT_RATE_PCT,
  MORTGAGE_DEFAULT_TERM_YEARS,
  MORTGAGE_SMALL_PRINT,
  SCOTLAND_TAX_LINE,
  SCOTLAND_TAX_LINK,
  STAMP_DUTY_RATES_LINE,
  STAMP_DUTY_RATES_URL,
  STAMP_DUTY_SMALL_PRINT,
  WALES_TAX_LINE,
  WALES_TAX_LINK,
  defaultDeposit,
  depositShareLine,
  mortgageMonthly,
  stampDuty,
  stampDutyFraming,
  type BuyerKind,
} from "../lib/calculators";
import type { Nation } from "../lib/journey";
import { Button, TextField } from "./kit";

// The "Could this home fit your life?" calculators
// (M7.10 as amended, fold-in build). Client island below
// the results tabs: pre-filled from the home's own last
// recorded sale price (never an asking price), always
// editable, and nothing typed here is stored or sent
// anywhere — the arithmetic is lib/calculators.ts, run in
// the page.
//
// M7.10 gap-check fold-ins (founder rulings, 18 Nov 2026):
// G1 — the stamp duty card is nation-aware: Scotland and
// Wales replace the SDLT calculation with the named line
// for their own tax (no figures served); the mortgage card
// is unchanged for every nation. G3 — the inputs render
// through the kit's TextField (.field / .field__input:
// 16px text, 44px targets) and the Calculate buttons
// through the kit's Button; the radios keep their fieldset
// pattern. G4 — editing any input clears that card's
// result, and Calculate with no valid price shows the
// step's prompt line as the result. G5 — the deposit shows
// its share of the current price beside the £ box (the
// TextField hint), display only.

function num(value: string): number {
  const parsed = Number(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function Calculators({
  lastSalePrice,
  nation,
}: {
  lastSalePrice: number | null;
  nation?: Nation;
}) {
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
  const depositShare = depositShareLine(num(price), num(deposit));

  // The devolved-nation form of the stamp duty card (G1):
  // a named line and the official source, nothing else —
  // no price box, no buyer choices, no SDLT small print.
  const devolvedTax =
    nation === "scotland"
      ? { line: SCOTLAND_TAX_LINE, link: SCOTLAND_TAX_LINK }
      : nation === "wales"
        ? { line: WALES_TAX_LINE, link: WALES_TAX_LINK }
        : null;

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
          <TextField
            id="calc-price"
            label="Home price (£)"
            inputMode="numeric"
            value={price}
            onChange={(e) => {
              setPrice(e.target.value);
              setMortgageSentence(null);
            }}
          />
          <TextField
            id="calc-deposit"
            label="Deposit (£)"
            hint={depositShare ?? undefined}
            inputMode="numeric"
            value={deposit}
            onChange={(e) => {
              setDeposit(e.target.value);
              setMortgageSentence(null);
            }}
          />
          <TextField
            id="calc-rate"
            label="Interest rate (% a year)"
            inputMode="decimal"
            value={rate}
            onChange={(e) => {
              setRate(e.target.value);
              setMortgageSentence(null);
            }}
          />
          <TextField
            id="calc-term"
            label="Term (years)"
            inputMode="numeric"
            value={term}
            onChange={(e) => {
              setTerm(e.target.value);
              setMortgageSentence(null);
            }}
          />
          <Button
            type="button"
            onClick={() =>
              setMortgageSentence(
                num(price) > 0
                  ? mortgageMonthly(num(price), num(deposit), num(rate), num(term)).sentence
                  : EMPTY_PRICE_PROMPT,
              )
            }
          >
            Calculate monthly payment
          </Button>
          {mortgageSentence && <p className="calculator-card__result">{mortgageSentence}</p>}
          <p className="calculator-card__small">{MORTGAGE_SMALL_PRINT}</p>
        </div>
        <div className="calculator-card">
          <h3>Stamp duty calculator</h3>
          {devolvedTax ? (
            <>
              <p>{devolvedTax.line}</p>
              <p className="calculator-card__small">
                <a href={devolvedTax.link.url}>{devolvedTax.link.label}</a>
              </p>
            </>
          ) : (
            <>
              <p>{stampDutyFraming(lastSalePrice, framingDuty)}</p>
              <TextField
                id="calc-sd-price"
                label="Purchase price (£)"
                inputMode="numeric"
                value={sdPrice}
                onChange={(e) => {
                  setSdPrice(e.target.value);
                  setSdSentence(null);
                }}
              />
              <fieldset>
                <legend>Which sounds like you?</legend>
                {BUYER_CHOICES.map((choice) => (
                  <label key={choice.key}>
                    <input
                      type="radio"
                      name="buyer-kind"
                      value={choice.key}
                      checked={buyer === choice.key}
                      onChange={() => {
                        setBuyer(choice.key);
                        setSdSentence(null);
                      }}
                    />{" "}
                    {choice.label}
                  </label>
                ))}
              </fieldset>
              <Button
                type="button"
                onClick={() =>
                  setSdSentence(
                    num(sdPrice) > 0
                      ? `£${stampDuty(num(sdPrice), buyer).toLocaleString("en-GB")} on top of the price.`
                      : EMPTY_PRICE_PROMPT,
                  )
                }
              >
                Calculate stamp duty
              </Button>
              {sdSentence && <p className="calculator-card__result">{sdSentence}</p>}
              <p className="calculator-card__small">{STAMP_DUTY_SMALL_PRINT}</p>
              <p className="calculator-card__small">
                <a href={STAMP_DUTY_RATES_URL}>{STAMP_DUTY_RATES_LINE}</a>
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
