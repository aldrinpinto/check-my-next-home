import type { JSX } from "react";

import {
  HOME_SOURCE_STRIP_HEADING,
  HOME_SOURCE_STRIP_SOURCES,
  type HomeSourceStripSourceId,
} from "../lib/home";

// The source strip (founder's ruling, 18 Nov 2026 — the
// samples' Version B, chosen over the text strip and over
// the bodies' real logos): a white band directly under the
// hero, headed "Powered by official UK data", carrying the
// eight sources as drawn greyscale lockups — a drawn glyph
// beside each short-form name, the multi-word names stacked
// on two lines with the glyph at the full height of the two
// lines, the one-word names centred in the same band. The
// glyphs are drawn here, in the sample's form — inline SVG
// only, never the bodies' real logos, never image files.
const GLYPHS: Record<HomeSourceStripSourceId, JSX.Element> = {
  hmlr: (
    <svg width="31" height="31" viewBox="0 0 26 26" aria-hidden="true">
      <circle cx="13" cy="13" r="11" fill="none" stroke="#6B6B6B" strokeWidth="1.6" />
      <path
        d="M8 18 V9 L13 6 L18 9 V18"
        fill="none"
        stroke="#6B6B6B"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M11 18 V13 H15 V18" fill="none" stroke="#6B6B6B" strokeWidth="1.4" />
    </svg>
  ),
  ea: (
    <svg width="31" height="31" viewBox="0 0 26 26" aria-hidden="true">
      <circle cx="13" cy="13" r="11" fill="none" stroke="#6B6B6B" strokeWidth="1.6" />
      <path
        d="M13 19 V11 M13 11 C13 8 11 6.5 8.5 6.5 C8.5 9 10 11 13 11 M13 13 C13 10.5 14.5 9 17.5 9 C17.5 11.5 16 13 13 13"
        fill="none"
        stroke="#6B6B6B"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  ),
  police: (
    <svg width="31" height="31" viewBox="0 0 26 26" aria-hidden="true">
      <path
        d="M13 3 L21 6 V13 C21 18 17.5 21 13 23 C8.5 21 5 18 5 13 V6 Z"
        fill="none"
        stroke="#6B6B6B"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M9.5 13 L12 15.5 L16.5 10.5"
        fill="none"
        stroke="#6B6B6B"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  ofcom: (
    <svg width="31" height="31" viewBox="0 0 26 26" aria-hidden="true">
      <circle cx="9" cy="13" r="5.5" fill="none" stroke="#6B6B6B" strokeWidth="1.8" />
      <circle
        cx="18"
        cy="13"
        r="5.5"
        fill="none"
        stroke="#6B6B6B"
        strokeWidth="1.8"
        opacity=".55"
      />
    </svg>
  ),
  defra: (
    <svg width="31" height="31" viewBox="0 0 26 26" aria-hidden="true">
      <path
        d="M4 20 C8 12 14 7 22 6 C21 14 16 19 8 21 L4 20 Z"
        fill="none"
        stroke="#6B6B6B"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M6 19 C10 14 14 11 19 8" fill="none" stroke="#6B6B6B" strokeWidth="1.3" />
    </svg>
  ),
  ons: (
    <svg width="31" height="31" viewBox="0 0 26 26" aria-hidden="true">
      <path d="M5 21 H21" stroke="#6B6B6B" strokeWidth="1.6" strokeLinecap="round" />
      <rect x="6.5" y="13" width="3.4" height="7" fill="#6B6B6B" />
      <rect x="11.3" y="9" width="3.4" height="11" fill="#6B6B6B" opacity=".7" />
      <rect x="16.1" y="5.5" width="3.4" height="14.5" fill="#6B6B6B" opacity=".45" />
    </svg>
  ),
  dfe: (
    <svg width="31" height="31" viewBox="0 0 26 26" aria-hidden="true">
      <path
        d="M5 8 L13 4.5 L21 8 M6.5 8 V19 M11 8 V19 M15 8 V19 M19.5 8 V19 M4.5 19 H21.5 M4.5 21.5 H21.5"
        fill="none"
        stroke="#6B6B6B"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  epc: (
    <svg width="31" height="31" viewBox="0 0 26 26" aria-hidden="true">
      <path
        d="M4 12 L13 4 L22 12"
        fill="none"
        stroke="#6B6B6B"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="7" y="15" width="3" height="6" fill="#6B6B6B" />
      <rect x="11.5" y="15" width="3" height="6" fill="#6B6B6B" opacity=".65" />
      <rect x="16" y="15" width="3" height="6" fill="#6B6B6B" opacity=".35" />
    </svg>
  ),
};

export default function SourceStrip() {
  return (
    <section className="source-strip" aria-label="Data sources">
      <p className="source-strip__head">{HOME_SOURCE_STRIP_HEADING}</p>
      <div className="source-strip__logos">
        {HOME_SOURCE_STRIP_SOURCES.map((source) => (
          <span className="source-lockup" key={source.id}>
            {GLYPHS[source.id]}
            <span className={`source-lockup__name source-lockup__name--${source.id}`}>
              {source.lines.map((line) => (
                <span className="source-lockup__line" key={line}>
                  {line}
                </span>
              ))}
            </span>
          </span>
        ))}
      </div>
    </section>
  );
}
