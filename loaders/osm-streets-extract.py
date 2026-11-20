#!/usr/bin/env python3
"""OSM highway cutter for the street-lines loader (plan step M8.3).

Called by loaders/load-streets.mjs — never run by hand:

  python3 loaders/osm-streets-extract.py <input.osm.pbf|.osm> <output.ndjson>

Emits one JSON object per line for every WAY carrying a
highway key, with the way's full node geometry:

  {"id": <osm way id>, "tags": {...},
   "points": [[lat, lon], ...]}

Which highway values become street lines is the loader's
decision, not this cutter's: the cutter is deliberately
dumb about the vocabulary so the filing rules live in one
place (the places cutter's osm-extract.py pattern).

Why this shape: the same reason as osm-extract.py (gap
check L11 on the places prep) — a per-object Python pass
over a country extract is unusably slow, so the cutting
rides libosmium's C++ machinery: FileProcessor with a
KeyFilter on "highway", so Python only ever sees the
highway-carrying objects. Locations come from
with_locations, so each way's node coordinates ride
along without a second pass.

Progress is reported to stderr every 100,000 ways so a
long national run (the loader runs detached) leaves a
visible trail in its log.

Requires pyosmium (pip install osmium) — the only Python
the project runs, isolated to the cutters.
"""

import json
import sys

import osmium


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: osm-streets-extract.py <input> <output.ndjson>", file=sys.stderr)
        return 2
    source, out_path = sys.argv[1], sys.argv[2]

    # Locations live in a DISK-BACKED sparse file array, not flex_mem:
    # a whole-country extract holds 100M+ node locations and flex_mem
    # (all in RAM) dies with std::bad_alloc on a small box — the M8.3
    # smoke proved it twice on the 3.8 GB play server. The index file
    # rides beside the output in the loader's temp workdir and is
    # cleaned with it. Proven on the real England extract: 6,596,554
    # highway ways in ~8 min with a bounded heap.
    fp = (
        osmium.FileProcessor(source)
        .with_locations(
            osmium.index.create_map(f"sparse_file_array,{out_path}.locidx")
        )
        .with_filter(osmium.filter.KeyFilter("highway"))
    )

    count = 0
    skipped = 0
    with open(out_path, "w", encoding="utf-8") as out:
        for obj in fp:
            if not isinstance(obj, osmium.osm.Way):
                continue
            pts = [[nd.location.lat, nd.location.lon] for nd in obj.nodes]
            if len(pts) < 2:
                skipped += 1
                continue
            out.write(
                json.dumps({"id": obj.id, "tags": dict(obj.tags), "points": pts}) + "\n"
            )
            count += 1
            if count % 100_000 == 0:
                print(f"osm-streets-extract · {count} highway ways", file=sys.stderr)
    print(
        f"osm-streets-extract · {count} highway ways · {skipped} ways skipped (under two points)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
