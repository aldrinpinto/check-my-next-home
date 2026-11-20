#!/usr/bin/env python3
"""OSM extract cutter for the nearby-places loader (plan step M5.6).

Called by loaders/load-osm-places.mjs — never run by hand:

  python3 loaders/osm-extract.py <input.osm.pbf|.osm> <output.ndjson>

Emits one JSON object per line for every object carrying an
amenity, shop, leisure or tourism key:

  {"kind": "node"|"way"|"relation", "id": <osm id>,
   "tags": {...}, "lat": <float>, "lon": <float>}

The point is the representative point the schema holds: a
node's own position, a way's node-average centre, and — for a
multipolygon (or untyped) relation — the average of its member
ways' node coordinates. Which tag VALUES become places is the
loader's decision, not this cutter's: the cutter is deliberately
dumb about the group mapping so the vocabulary lives in one
place.

Why this shape (gap check L11, measured in the M5.6 prep): a
per-object Python pass over a country extract is unusably slow
(the naive second pass over England did not finish in ~30
minutes), so the cutting rides libosmium's C++ machinery —
FileProcessor with a KeyFilter, so Python only ever sees the
~2% of objects carrying one of the four keys (England: 2.07M
candidates in 371 s in the prep). Relations need a second,
IdFilter pass for their member ways' geometry. Relations of
other types (routes, sites, turn restrictions) are counted and
skipped: their members are a grouping, not an outline, and an
averaged point for them would be a fiction.

Requires pyosmium (pip install osmium) — the only Python the
project runs, isolated to this cutter.
"""

import json
import sys

import osmium

KEYS = ("amenity", "shop", "leisure", "tourism")
ASSEMBLABLE_TYPES = (None, "", "multipolygon", "boundary")


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: osm-extract.py <input> <output.ndjson>", file=sys.stderr)
        return 2
    source, out_path = sys.argv[1], sys.argv[2]

    counts = {"node": 0, "way": 0, "relation": 0, "relation_skipped_type": 0,
              "relation_no_geometry": 0}

    def processor(*filters):
        # Disk-backed location index, not flex_mem: a whole-country
        # extract holds 100M+ node locations and flex_mem (all in RAM)
        # dies with std::bad_alloc on a small box — the M8.3 street
        # smoke proved it twice on the 3.8 GB play server. The index
        # file rides beside the output in the loader's temp workdir
        # and is cleaned with it. Both passes read the same extract,
        # so the same index file serves both.
        fp = osmium.FileProcessor(source).with_locations(
            osmium.index.create_map(f"sparse_file_array,{out_path}.locidx"))
        for f in filters:
            fp = fp.with_filter(f)
        return fp

    relations = {}  # id -> (tags, [(mtype, ref), ...])
    out = open(out_path, "w", encoding="utf-8")

    def emit(kind, oid, tags, lat, lon):
        out.write(json.dumps({"kind": kind, "id": oid, "tags": tags,
                              "lat": lat, "lon": lon}) + "\n")
        counts[kind] += 1

    for obj in processor(osmium.filter.KeyFilter(*KEYS)):
        tags = dict(obj.tags)
        if isinstance(obj, osmium.osm.Node):
            emit("node", obj.id, tags, obj.location.lat, obj.location.lon)
        elif isinstance(obj, osmium.osm.Way):
            pts = [(nd.location.lat, nd.location.lon) for nd in obj.nodes]
            if not pts:
                continue
            emit("way", obj.id, tags,
                 sum(p[0] for p in pts) / len(pts),
                 sum(p[1] for p in pts) / len(pts))
        elif isinstance(obj, osmium.osm.Relation):
            if tags.get("type") not in ASSEMBLABLE_TYPES:
                counts["relation_skipped_type"] += 1
                continue
            relations[obj.id] = (tags, [(m.type, m.ref) for m in obj.members])

    if relations:
        member_way_ids = set()
        member_node_ids = set()
        for _tags, members in relations.values():
            for mtype, ref in members:
                if mtype == "w":
                    member_way_ids.add(ref)
                elif mtype == "n":
                    member_node_ids.add(ref)
        way_points = {}   # way id -> [(lat, lon), ...]
        node_points = {}  # node id -> (lat, lon)
        wanted_ids = list(member_way_ids | member_node_ids)
        if wanted_ids:
            for obj in processor(osmium.filter.IdFilter(wanted_ids)):
                if isinstance(obj, osmium.osm.Way) and obj.id in member_way_ids:
                    way_points[obj.id] = [(nd.location.lat, nd.location.lon)
                                          for nd in obj.nodes]
                elif isinstance(obj, osmium.osm.Node) and obj.id in member_node_ids:
                    node_points[obj.id] = (obj.location.lat, obj.location.lon)
        for rid, (tags, members) in relations.items():
            pts = []
            for mtype, ref in members:
                if mtype == "w":
                    pts.extend(way_points.get(ref, []))
                elif mtype == "n" and ref in node_points:
                    pts.append(node_points[ref])
            if not pts:
                counts["relation_no_geometry"] += 1
                continue
            emit("relation", rid, tags,
                 sum(p[0] for p in pts) / len(pts),
                 sum(p[1] for p in pts) / len(pts))

    out.close()
    print("osm-extract · {node} nodes · {way} ways · {relation} relations · "
          "{relation_skipped_type} relations skipped by type · "
          "{relation_no_geometry} relations without geometry".format(**counts))
    return 0


if __name__ == "__main__":
    sys.exit(main())
