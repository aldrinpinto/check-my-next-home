// The schematic district sweep — the wider-area checking
// screen's centrepiece (founder ruling, 19 Nov 2026:
// Sample 3 of the wider-area checking samples, drawn as
// Final Sample Master view 31). A shared pure component:
// the client checking screen drives its beats, and the
// /search loading state's static frame renders it at
// rest, so the interim and the screen are one drawing.
//
// The geometry is Master view 31's own: the district
// outline, twelve shading cells (a quarter per group),
// the park, the roads, the river along the south with
// its flood wash, one station marker, and the district
// stamp at the centre. It is a sketch, never a map: no
// element is placed from real geography, and nothing in
// it claims street-level knowledge. The beats are the
// groups': cells shade a quarter as each group lands,
// the flood wash joins the Home, Costs & Risks group,
// the station marker joins What's Nearby, and the stamp
// lands only when every group has completed.

const BOUNDARY =
  "M30 42 L112 18 L206 26 L282 58 L296 128 L262 196 L168 222 L84 210 L34 150 L22 88 Z";
const RIVER = "M-6 200 C60 182 120 216 184 196 S 286 180 328 194";

// The twelve cells in the Master's order; the alt set
// is the Master's own ({3,4,5,6} — its drawn checker).
const CELLS: { x: number; y: number; h: number; alt: boolean }[] = [
  { x: 8, y: 8, h: 76, alt: false },
  { x: 86, y: 8, h: 76, alt: false },
  { x: 164, y: 8, h: 76, alt: false },
  { x: 242, y: 8, h: 76, alt: true },
  { x: 8, y: 84, h: 76, alt: true },
  { x: 86, y: 84, h: 76, alt: true },
  { x: 164, y: 84, h: 76, alt: true },
  { x: 242, y: 84, h: 76, alt: false },
  { x: 8, y: 160, h: 74, alt: false },
  { x: 86, y: 160, h: 74, alt: false },
  { x: 164, y: 160, h: 74, alt: false },
  { x: 242, y: 160, h: 74, alt: false },
];

export default function DistrictSweep({
  clipId,
  outward,
  groupsDone,
  floodOn,
  stationOn,
  stampOn,
  stampBig,
  stampSmall,
}: {
  clipId: string;
  outward: string;
  // Groups completed: the first quarter of cells per
  // completed group shades in.
  groupsDone: number;
  floodOn: boolean;
  stationOn: boolean;
  stampOn: boolean;
  stampBig: string;
  stampSmall: string | null;
}) {
  return (
    <svg
      className="dchecking__sweep"
      viewBox="0 0 320 240"
      role="img"
      aria-label={
        outward
          ? `Schematic sketch of the ${outward} district — an illustration, not a map.`
          : "Schematic sketch of a postcode district — an illustration, not a map."
      }
    >
      <defs>
        <clipPath id={clipId}>
          <path d={BOUNDARY} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        {CELLS.map((cell, index) => (
          <rect
            key={index}
            className="dchecking__sweep-cell"
            data-alt={cell.alt ? "true" : undefined}
            data-on={index < groupsDone * 3 ? "true" : undefined}
            x={cell.x}
            y={cell.y}
            width={78}
            height={cell.h}
          />
        ))}
        <rect className="dchecking__sweep-park" x={230} y={14} width={74} height={56} rx={10} />
      </g>
      <path
        className="dchecking__sweep-road"
        d="M-6 118 H326 M160 -6 V246 M-6 52 C80 62 240 40 326 58"
      />
      <path
        className="dchecking__sweep-road-sm"
        d="M-6 168 C90 176 220 158 326 172 M252 -6 C244 70 262 150 250 246"
      />
      <path className="dchecking__sweep-flood" data-on={floodOn ? "true" : undefined} d={RIVER} />
      <path className="dchecking__sweep-river" d={RIVER} />
      <path className="dchecking__sweep-boundary" d={BOUNDARY} />
      <g className="dchecking__sweep-station" data-on={stationOn ? "true" : undefined}>
        <circle cx={268} cy={164} r={11.5} />
        <text x={268} y={168.5}>
          St
        </text>
      </g>
      <g
        className="dchecking__sweep-stamp"
        data-on={stampOn ? "true" : undefined}
        transform="rotate(-9 160 119)"
      >
        <rect x={92} y={90} width={136} height={58} rx={8} />
        <text className="dchecking__sweep-stamp-big" x={160} y={122}>
          {stampBig}
        </text>
        {stampSmall && (
          <text className="dchecking__sweep-stamp-sm" x={160} y={139}>
            {stampSmall}
          </text>
        )}
      </g>
    </svg>
  );
}
