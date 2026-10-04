// Preserve the first wording of each note while preventing echoed model/context
// notes from multiplying on every planning round trip.
export function mergePreferenceNotes(
  ...sources: (string | undefined)[]
): string {
  const seen = new Set<string>();
  return sources
    .flatMap((source) => (source ?? "").split(/\r?\n/))
    .map((line) => line.trim())
    .filter((line) => {
      const key = line
        .normalize("NFKC")
        .replace(/[’‘]/g, "'")
        .replace(/\s+/g, " ")
        .toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join("\n")
    .slice(0, 1000);
}
