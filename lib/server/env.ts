// envValue — an environment value that counts as set
// only when it carries something (BUG-148, second
// half, 22 Nov 2026). docker-compose.yml passes names
// as ${NAME:-}, so an unplaced name arrives in the app
// present but EMPTY — and a `??` fallback does not
// trigger on an empty string: the app sent mail with
// an empty From and the sender refused it, while the
// host worker (where the name is simply absent) worked
// all along. Every mail factory reads its names
// through here: unset, empty and blank all read as
// undefined, so a factory's fallback or its
// not-configured answer engages exactly as it does
// when the name was never placed.
export function envValue(name: string): string | undefined {
  const value = process.env[name];
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}
