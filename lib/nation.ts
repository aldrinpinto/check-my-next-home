// The postcode-area nation detector (BUG-106 stack,
// slimmed Road A + the nation-paths analysis Section 1
// settlement): nation for ROUTING and DOOR purposes is
// read from the postcode area — no postcode area straddles
// the Scotland–England border (DG and TD are wholly
// Scottish; the English areas facing them are wholly
// English) and BT is wholly Northern Ireland. The filed
// small-area code is NOT safe for this job: the Postcode
// Directory files border postcodes by their centre point,
// so DG16 5JB (Gretna) carries an English small-area code
// and was labelled with an English council, ward and LSOA
// as if local. Small-area readings keep their honest
// internal jobs inside the England & Wales path (flood's
// Wales line, the calculators' stamp-duty wording); they
// never route a Scotland/NI home again.

export const SCOTLAND_POSTCODE_AREAS: ReadonlySet<string> = new Set([
  "AB",
  "DD",
  "DG",
  "EH",
  "FK",
  "G",
  "HS",
  "IV",
  "KA",
  "KY",
  "ML",
  "PA",
  "PH",
  "TD",
  "ZE",
]);

export type PostcodeNation = "scotland" | "northern-ireland" | null;

// The nation a postcode belongs to, from its outward
// area letters alone; null where the area is England &
// Wales (or the postcode cannot be read).
export function nationOfPostcode(postcode: string | null | undefined): PostcodeNation {
  if (!postcode) return null;
  const outward = postcode.trim().toUpperCase().split(/\s+/)[0] ?? "";
  const area = /^[A-Z]+/.exec(outward)?.[0] ?? "";
  if (area === "BT") return "northern-ireland";
  if (SCOTLAND_POSTCODE_AREAS.has(area)) return "scotland";
  return null;
}

export function isScotlandOrNorthernIrelandPostcode(postcode: string | null | undefined): boolean {
  return nationOfPostcode(postcode) !== null;
}
