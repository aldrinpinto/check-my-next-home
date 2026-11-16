// The register's improvement-measure names (plan step M6.21,
// decision D41).
//
// A certificate's suggested improvements arrive from the
// register as numbers and codes only — the API returns no
// text for a measure. The names live in the register schema's
// published improvement list: the ExternalDefinitions.xml of
// the lodgement schemas the register itself publishes
// (communitiesuk/epb-data-warehouse, api/schemas/xml). This
// table is a transcription of that published list — the union
// of the current RdSAP list (RdSAP-Schema-21.0.1, 60 entries)
// and the entries only the current SAP list carries
// (SAP-Schema-19.2.0: numbers 24, 25, 30, 31, 47), because
// certificates of both families serve. The two lists agree
// everywhere else except trivial wording at numbers 8 and 45,
// where the newer RdSAP wording is held. Transcribed at build
// (16 Nov 2026) from:
//   https://raw.githubusercontent.com/communitiesuk/epb-data-warehouse/main/api/schemas/xml/RdSAP-Schema-21.0.1/RdSAP/ExternalDefinitions.xml
//   https://raw.githubusercontent.com/communitiesuk/epb-data-warehouse/main/api/schemas/xml/SAP-Schema-19.2.0/SAP/ExternalDefinitions.xml
//
// The numbers are stable across schema vintages: every number
// the register's filed certificates use (5, 6, 14, 19, 34, 35,
// 58) reads identically in the 17.x, 18.x, 20.x and 21.x
// lists, verified at build.
//
// A number this table does not hold resolves to null: the
// measure then serves its figures with NO name line — a bare
// code or an invented name never reaches a reader — and the
// loader contract tests fail loud on any number the filed
// fixture certificates use that the table cannot resolve.

export const IMPROVEMENT_NAMES: Readonly<Record<number, string>> = {
  1: "Insulate hot water cylinder with 80 mm jacket",
  2: "Increase hot water cylinder insulation",
  3: "Add additional 80 mm jacket to hot water cylinder",
  4: "Hot water cylinder thermostat",
  5: "Increase loft insulation to 270 mm",
  6: "Cavity wall insulation",
  7: "50 mm internal or external wall insulation",
  8: "Replace single glazed windows with low-E double glazed windows",
  9: "Secondary glazing to single glazed windows",
  10: "Draught proof single-glazed windows",
  11: "Upgrade heating controls",
  12: "Upgrade heating controls",
  13: "Upgrade heating controls",
  14: "Upgrade heating controls",
  15: "Upgrade heating controls",
  16: "Time and temperature zone control",
  17: "Upgrade heating controls",
  18: "Upgrade heating controls",
  19: "Solar water heating",
  20: "Replace boiler with new condensing boiler",
  22: "Replace boiler with biomass boiler",
  23: "Wood pellet stove with boiler and radiators",
  24: "Fan assisted storage heaters and dual immersion cylinder",
  25: "Fan-assisted storage heaters",
  26: "Replacement warm air unit",
  27: "Change heating to gas condensing boiler",
  28: "Condensing oil boiler with radiators",
  29: "Change heating to gas condensing boiler",
  30: "Fan assisted storage heaters and dual immersion cylinder",
  31: "Fan-assisted storage heaters",
  34: "Solar photovoltaic panels, 2.5 kWp",
  35: "Low energy lighting for all fixed outlets",
  36: "Replace heating unit with condensing unit",
  37: "Install condensing boiler",
  38: "Install condensing boiler",
  39: "Wood pellet stove with boiler and radiators",
  40: "Change room heaters to condensing boiler",
  42: "Replace heating unit with mains gas condensing unit",
  44: "Wind turbine",
  45: "Flat roof or sloping ceiling insulation",
  46: "Room-in-roof insulation",
  47: "Floor insulation",
  48: "High performance external doors",
  49: "Heat recovery system for mixer showers",
  50: "Flue gas heat recovery in conjunction with boiler",
  51: "Air or ground source heat pump",
  52: "Air or ground source heat pump with underfloor heating",
  53: "Micro CHP",
  54: "Biomass boiler (Exempted Appliance if in Smoke Control Area)",
  55: "External insulation with cavity wall insulation",
  56: "Replacement glazing units",
  57: "Floor insulation (suspended floor)",
  58: "Floor insulation (solid floor)",
  59: "High heat retention storage heaters and dual immersion cylinder",
  60: "High heat retention storage heaters",
  61: "High heat retention storage heaters and dual immersion cylinder",
  62: "High heat retention storage heaters",
  63: "Party wall insulation",
  65: "External wall insulation",
  66: "Internal insulation with cavity wall insulation",
  70: "Water heating controls",
  72: "Add PV battery",
  73: "Add PV diverter",
  75: "Air or ground source heat pump",
  76: "Air or ground source heat pump with underfloor heating",
};

// The served name for one filed improvement number, or null
// when the published list holds no name for it.
export function improvementName(improvementNumber: number | null | undefined): string | null {
  if (improvementNumber === null || improvementNumber === undefined) return null;
  return IMPROVEMENT_NAMES[improvementNumber] ?? null;
}
