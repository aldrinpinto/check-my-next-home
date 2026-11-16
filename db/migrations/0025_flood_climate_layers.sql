-- Check My Next Home — migration 0025: flood climate-scenario
-- layers (plan step M6.28, decision D49).
--
-- The Environment Agency's two NaFRA Climate Change 1
-- likelihood products: Risk of Flooding from Rivers and Sea
-- – Climate Change 1 (collection rofrs_cc01_4band) and Risk
-- of Flooding from Surface Water – Climate Change 1
-- (collection rofsw_cc01). Each files ONE published scenario
-- (UKCP18, RCP 8.5; per-source allowances and epochs are
-- serving material, pinned in the brain — not columns here).
--
-- The table mirrors flood_layers column-for-column — the
-- same id, layer_type, risk_label, geom, layer_date,
-- source_name, source_date, loaded_at and (migration 0008)
-- detail — and holds layer_type 'rofrs_cc' and 'rofsw_cc'
-- only. It is a SEPARATE table on purpose, not two more
-- flood_layers types and not a scenario column on that
-- table:
--
--   * flood_layers' contract (docs/schema.md entry 15, D25)
--     is "the three present-day NaFRA2 products, never
--     merged". Keeping scenario shapes out of it means no
--     present-day query — current or future — can ever
--     serve a scenario shape as a present-day fact, or vice
--     versa. That mix-up is the cardinal error for this
--     step; the storage shape makes it structurally
--     impossible, not merely filtered.
--   * The D29 flood guard reads filed counts per layer_type;
--     a separate table keeps the present-day guard's meaning
--     untouched and gives the scenario sources their own
--     counts, on their own quarterly cycle.
--
-- Like flood_layers the table is single-edition per
-- layer_type: each loader stages, counts, repairs
-- (ST_MakeValid) and swaps its layer's rows in one
-- transaction, so a failed load never overwrites the last
-- good filing. Absence is never filed: there are no
-- synthetic "no band" shapes — a point no polygon covers
-- under the scenario is computed against the filed counts
-- at serve time, and is a different fact from any band.

CREATE TABLE flood_climate_layers (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  layer_type text NOT NULL,
  risk_label text,
  geom geometry(MultiPolygon, 4326) NOT NULL,
  layer_date date,
  source_name text,
  source_date date,
  loaded_at timestamptz NOT NULL DEFAULT now(),
  detail text
);
CREATE INDEX flood_climate_layers_geom_idx ON flood_climate_layers USING gist (geom);
CREATE INDEX flood_climate_layers_type_idx ON flood_climate_layers (layer_type);
