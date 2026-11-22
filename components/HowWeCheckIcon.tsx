// BUG-157 (founder ruling, 22 Nov 2026): the How We
// Check cards' tiles draw a glyph of each section's own
// subject, replacing the abstract typographic glyphs
// (£ § ≈ Aa + % ∿ ¤ ¶ ⌂ ◎) that stood there before —
// a section sign for Crime and a paragraph mark for
// Planning told the visitor nothing.
//
// One stroke language for the whole set: 24×24 grid,
// outline only (fill none), stroke = currentColor (the
// tile paints it white on Forest), stroke width 1.8,
// round caps and joins — drawn to stay legible at the
// tile's 22px render size. The per-section choices:
//
//   sold-prices    a price tag with its string hole
//   crime          a shield
//   flood          a house with water at its base
//   schools        an open book
//   health         a medical cross in a circle
//   neighbourhood  a bar chart (the area in numbers)
//   air-noise      wind lines
//   costs          a £ coin (circle, £ struck through)
//   planning       a house with its deed (the document
//                  standing as the door, signed line)
//   building-safety a tower block with a check
//   nearby         a map pin
//
// An unknown key renders nothing rather than a wrong
// glyph; the card set and this set are pinned together
// by tests/how-we-check-icons.test.ts.

export const HOW_WE_CHECK_ICON_KEYS = [
  "sold-prices",
  "crime",
  "flood",
  "schools",
  "health",
  "neighbourhood",
  "air-noise",
  "costs",
  "planning",
  "building-safety",
  "nearby",
] as const;

const PATHS: Record<string, React.ReactNode> = {
  "sold-prices": (
    <>
      <path d="M4.5 4.5h7.6c.5 0 1 .2 1.4.6l6 6c.8.8.8 2 0 2.8l-7.6 7.6a2 2 0 0 1-2.8 0l-6-6a2 2 0 0 1-.6-1.4V4.5z" />
      <circle cx="8.6" cy="8.6" r="1.3" />
    </>
  ),
  crime: <path d="M12 3.5l6.5 2.3v5.4c0 4.3-2.8 7.4-6.5 9.3-3.7-1.9-6.5-5-6.5-9.3V5.8z" />,
  flood: (
    <>
      <path d="M5.5 12.2L12 6l6.5 6.2" />
      <path d="M7.6 10.4v3.4M16.4 10.4v3.4" />
      <path d="M3 17.2c1.8-1.7 3.6-1.7 5.4 0s3.6 1.7 5.4 0 3.6-1.7 5.4 0" />
      <path d="M3 20.4c1.8-1.7 3.6-1.7 5.4 0s3.6 1.7 5.4 0 3.6-1.7 5.4 0" />
    </>
  ),
  schools: (
    <>
      <path d="M12 6.2C9.8 4.7 6.6 4.4 4 5.2v13c2.6-.8 5.8-.5 8 1 2.2-1.5 5.4-1.8 8-1v-13c-2.6-.8-5.8-.5-8 1z" />
      <path d="M12 6.2v13" />
    </>
  ),
  health: (
    <>
      <circle cx="12" cy="12" r="8.3" />
      <path d="M12 8.4v7.2M8.4 12h7.2" />
    </>
  ),
  neighbourhood: (
    <>
      <path d="M4 4v16h16" />
      <path d="M8.2 20v-5.4M12.4 20V9.8M16.6 20v-7.6" />
    </>
  ),
  "air-noise": (
    <>
      <path d="M3 8h9.6a2.6 2.6 0 1 0-2.5-3.4" />
      <path d="M2.5 12.5h14.3a2.6 2.6 0 1 1-2.5 3.4" />
      <path d="M3 17h6.5" />
    </>
  ),
  costs: (
    <>
      <circle cx="12" cy="12" r="8.3" />
      <text
        x="12"
        y="16.4"
        textAnchor="middle"
        fontSize="11.5"
        fontWeight="700"
        fill="currentColor"
        stroke="none"
      >
        £
      </text>
    </>
  ),
  planning: (
    <>
      <path d="M4.5 11L12 4.5 19.5 11" />
      <path d="M6.8 9.4V19.5h10.4V9.4" />
      <path d="M10.2 19.5v-6h3.6v6" />
      <path d="M11.2 16.2h1.6" />
    </>
  ),
  "building-safety": (
    <>
      <path d="M7 20.5v-16a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16" />
      <path d="M4.5 20.5h15" />
      <path d="M9.6 12.4l1.8 1.8 3.4-4" />
    </>
  ),
  nearby: (
    <>
      <path d="M12 21s-6.6-5.5-6.6-10.1a6.6 6.6 0 1 1 13.2 0C18.6 15.5 12 21 12 21z" />
      <circle cx="12" cy="10.6" r="2.3" />
    </>
  ),
};

export default function HowWeCheckIcon({ name }: { name: string }) {
  const paths = PATHS[name];
  if (!paths) return null;
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths}
    </svg>
  );
}
