import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { buildReportView, declutterMapPins, MAP_PIN_MIN_SEPARATION_PX } from "../lib/report";
import { input } from "./fixtures/report-inputs";

// BUG-237 — the Section 5 "What's nearby" map: in a
// dense area the listed places land within a few pixels
// of each other and their 22px discs overlap, so the
// numbered pins are unreadable. The frame is the
// two-mile picture (the rings at 1 and 2 miles are the
// design), so the pins are separated in the model
// instead of zooming the frame in. The pin set below
// is the live sample's own (Capital East, 24 Nov 2026
// — 33 pins, eleven of them inside one 8×10px patch,
// pins 27/31/33 unreadable in the audit): the
// relaxation must separate every pair to a full
// pin-width, keep every pin clear of the home marker,
// and keep every pin inside the frame.

// The 0.1px rounding the helper applies at the end can
// shave at most ~0.15px off a pairwise distance, so
// the separation pins allow that much slack.
const SEPARATION = MAP_PIN_MIN_SEPARATION_PX - 0.2;

const HOME = { x: 380, y: 260 };
const WIDTH = 760;
const HEIGHT = 520;

// The live sample's Section 5 pins, as served (number,
// x, y) — the audit's unreadable set.
const LIVE_PINS: { x: number; y: number }[] = [
  { x: 155.2, y: 434.1 },
  { x: 147.2, y: 426 },
  { x: 146.9, y: 425.9 },
  { x: 155.5, y: 428.6 },
  { x: 152.4, y: 435 },
  { x: 154.2, y: 425 },
  { x: 150.4, y: 429.4 },
  { x: 150, y: 430.2 },
  { x: 150, y: 430.2 },
  { x: 151.5, y: 429 },
  { x: 151.7, y: 428.9 },
  { x: 153, y: 429.8 },
  { x: 151.7, y: 430.4 },
  { x: 151.7, y: 429.9 },
  { x: 151.2, y: 430.1 },
  { x: 151.8, y: 430.4 },
  { x: 150.5, y: 429.7 },
  { x: 150.1, y: 431.2 },
  { x: 147.7, y: 427.2 },
  { x: 146.4, y: 430.2 },
  { x: 146.3, y: 430.3 },
  { x: 150.1, y: 432.1 },
  { x: 154.6, y: 428.1 },
  { x: 148.5, y: 426.6 },
  { x: 155.4, y: 425.5 },
  { x: 147.5, y: 424.4 },
  { x: 164.9, y: 425.6 },
  { x: 158.7, y: 439.9 },
  { x: 139.3, y: 433.5 },
  { x: 151.3, y: 442.1 },
  { x: 146.8, y: 444.2 },
  { x: 147.7, y: 428.4 },
  { x: 145.4, y: 426.8 },
];

function minPairwise(pins: { x: number; y: number }[]): number {
  let min = Infinity;
  for (let i = 0; i < pins.length; i++) {
    for (let j = i + 1; j < pins.length; j++) {
      min = Math.min(min, Math.hypot(pins[j].x - pins[i].x, pins[j].y - pins[i].y));
    }
  }
  return min;
}

describe("BUG-237 — the Section 5 map's pins separate", () => {
  it("separates the live sample's clustered pins to a full pin-width", () => {
    expect(minPairwise(LIVE_PINS)).toBeLessThan(2);
    const placed = declutterMapPins(LIVE_PINS, HOME, WIDTH, HEIGHT);
    expect(placed).toHaveLength(LIVE_PINS.length);
    expect(minPairwise(placed)).toBeGreaterThanOrEqual(SEPARATION);
    for (const pin of placed) {
      expect(Math.hypot(pin.x - HOME.x, pin.y - HOME.y)).toBeGreaterThanOrEqual(SEPARATION);
      expect(pin.x).toBeGreaterThanOrEqual(13);
      expect(pin.x).toBeLessThanOrEqual(WIDTH - 13);
      expect(pin.y).toBeGreaterThanOrEqual(13);
      expect(pin.y).toBeLessThanOrEqual(HEIGHT - 13);
    }
  });

  it("is deterministic: the same pins always draw the same picture", () => {
    expect(declutterMapPins(LIVE_PINS, HOME, WIDTH, HEIGHT)).toEqual(
      declutterMapPins(LIVE_PINS, HOME, WIDTH, HEIGHT),
    );
  });

  it("leaves already-separated pins exactly where they stand", () => {
    const spread = [
      { x: 100, y: 100 },
      { x: 200, y: 100 },
      { x: 100, y: 200 },
      { x: 600, y: 400 },
    ];
    expect(declutterMapPins(spread, HOME, WIDTH, HEIGHT)).toEqual(spread);
  });

  it("separates coincident pins, and keeps a pin off the home marker", () => {
    const twins = declutterMapPins(
      [
        { x: 150, y: 430.2 },
        { x: 150, y: 430.2 },
      ],
      HOME,
      WIDTH,
      HEIGHT,
    );
    expect(Math.hypot(twins[1].x - twins[0].x, twins[1].y - twins[0].y)).toBeGreaterThanOrEqual(
      SEPARATION,
    );
    const onHome = declutterMapPins([{ x: 380, y: 260 }], HOME, WIDTH, HEIGHT);
    expect(Math.hypot(onHome[0].x - HOME.x, onHome[0].y - HOME.y)).toBeGreaterThanOrEqual(
      SEPARATION,
    );
  });

  it("the built report's Section 5 map carries separated pins", () => {
    const view = buildReportView(input());
    const s5 = view.sections.find((s) => s.number === 5)!;
    const mapBlock = s5.blocks.find((b) => b.type === "map");
    if (!mapBlock || mapBlock.type !== "map") throw new Error("expected the Section 5 map");
    const pins = mapBlock.map.pins;
    expect(pins.length).toBeGreaterThan(0);
    expect(minPairwise(pins)).toBeGreaterThanOrEqual(SEPARATION);
    for (const pin of pins) {
      expect(
        Math.hypot(pin.x - mapBlock.map.homeX, pin.y - mapBlock.map.homeY),
      ).toBeGreaterThanOrEqual(SEPARATION);
    }
  });

  it("the street ground draws visibly against the cream — not the blank #CFC7A8", () => {
    const page = readFileSync(join(process.cwd(), "components/ReportPage.tsx"), "utf8");
    // The street stroke, in both map renders (Section 5
    // and the flood pictures share the dress): the old
    // #CFC7A8 is named in the comment as the value it
    // replaces, so the pin targets the stroke itself.
    expect(page.match(/stroke=\{run\.home \? "#2F5D3E" : "#B3A67F"\}/g)).toHaveLength(2);
    expect(page).not.toContain('stroke={run.home ? "#2F5D3E" : "#CFC7A8"}');
  });
});
