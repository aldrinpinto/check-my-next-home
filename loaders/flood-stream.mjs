// Shared streaming plumbing for the flood loaders (BUG-187).
//
// The mechanism this module exists to break: a flood loader's
// read used to assemble the ENTIRE national dataset as an
// in-memory item array — the paged reads pushed every page's
// processed items into one array, the fixture reads
// concatenated every part — and the filer then mapped that
// array into a second whole-dataset array of WKT strings
// before inserting anything. Peak memory grew with the
// dataset (250k–415k dissolved, vertex-heavy features), and
// on the 8 GB play server the big layers died: three
// kernel-killed at ~5–5.6 GB RSS (the flat Float64Array
// geometry lives outside the V8 heap, so RSS is what grows),
// two at Node's heap limit inside a page's JSON.parse, the
// parse merely the last allocation on top of the accumulated
// arrays. Only the small defences set (141k lines) survived.
//
// The streaming shape, shared by every flood loader now:
// the read processes one page (or one fixture part) at a
// time and hands each batch to a sink — in a filing run, the
// staging inserter, which converts items to WKT and inserts
// them in bounded chunks as they land. Nothing dataset-sized
// is retained. What a run legitimately needs after the read
// is only (a) the totals — read / filed / geometry-less
// counts and the per-label census, accumulated here as
// scalars — and (b) the golden-homes evidence, sifted here.
//
// The golden sift: an item is retained only if its bounding
// box, on the exact plane the loaders' own nearest-edge code
// uses (longitude scaled by cos(latitude), miles = degrees
// of latitude x 69.05), comes within GOLDEN_WINDOW_MILES of
// a golden home. The retention is COMPLETE for every golden
// assertion the loaders make: a covering polygon's box
// contains the point (lower bound 0), and every pinned
// nearest distance is at most 0.84 miles plus a 0.03
// tolerance — far inside the window — so the true nearest
// item is always retained, and the loaders' checkGolden
// functions (unchanged) compute over the sifted set exactly
// the values they computed over the whole set. If a
// republication moved a golden fact outside the window, the
// checks fail loudly on the retained set ("none", or a
// distance beyond the pin), which is the golden contract.
// The window is a property of the golden homes, not of the
// dataset, so retained memory stays flat as the dataset
// grows.

// The largest pinned golden distance across the flood
// loaders is 0.84 miles (zones / rivers & sea, tolerance
// 0.03); 2 miles keeps every pinned candidate with room to
// spare while staying a local, dataset-independent set.
export const GOLDEN_WINDOW_MILES = 2;

// The bounding box of a flat-form polygon set — the same
// loops as the loaders' house bboxOf, over polygons -> rings
// -> Float64Array x,y pairs.
export function bboxOfPolygons(polygons) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const polygon of polygons)
    for (const ring of polygon)
      for (let i = 0; i < ring.length; i += 2) {
        const x = ring[i];
        const y = ring[i + 1];
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
  return [x0, y0, x1, y1];
}

// The exact-plane lower bound on the distance from a home
// to any edge inside the box, miles — the identical formula
// the loaders' nearestEdge pruning uses, so a box this
// distance away can hold no edge closer than it.
export function bboxDistanceMiles(bbox, home) {
  const scaleX = Math.cos((home.lat * Math.PI) / 180);
  const px = home.lng * scaleX;
  const py = home.lat;
  const [x0, y0, x1, y1] = bbox;
  const dx = px < x0 * scaleX ? x0 * scaleX - px : px > x1 * scaleX ? px - x1 * scaleX : 0;
  const dy = py < y0 ? y0 - py : py > y1 ? py - y1 : 0;
  return Math.sqrt(dx * dx + dy * dy) * 69.05;
}

// Retains, out of a stream of processed items, exactly the
// golden candidates: offer() every item; read .items at the
// end. Items are retained by reference, never copied.
export function createGoldenSift(homes, windowMiles = GOLDEN_WINDOW_MILES) {
  const homeList = Object.values(homes);
  const items = [];
  return {
    items,
    offer(item) {
      const bbox = item.bbox ?? bboxOfPolygons(item.polygons);
      for (const home of homeList) {
        if (bboxDistanceMiles(bbox, home) < windowMiles) {
          items.push(item);
          return;
        }
      }
    },
  };
}

// The read totals, accumulated batch by batch: raw features
// read, items filed (geometry-carrying), geometry-less
// features counted, and the per-label census. addBatch takes
// one processFeatures result and the raw feature count it
// came from — the same numbers the accumulating reads used
// to total at the end, kept as scalars instead.
//
// BUG-366: a resumed read seeds the totals from its
// checkpoint (initial: the checkpoint's read/filed/geoless
// counts and per-label census, in the checkpoint's snake_case
// shape), so the resumed run's totals count every feature
// once — the staged prefix from the checkpoint, the rest
// from the pages this run reads.
export function createTotals(vocab, initial = null) {
  const totals = {
    read: initial?.read_count ?? 0,
    filed: initial?.filed_count ?? 0,
    geoless: initial?.geoless_count ?? 0,
    perLabel: Object.fromEntries(vocab.map((label) => [label, initial?.per_label?.[label] ?? 0])),
    addBatch(processed, rawCount) {
      totals.read += rawCount;
      totals.filed += processed.items.length;
      totals.geoless += processed.geoless;
      for (const label of vocab) totals.perLabel[label] += processed.perLabel[label];
    },
  };
  return totals;
}
