/**
 * Turns what someone typed ("1,250.5", "₱ 300", "45") into integer centavos
 * using string arithmetic only, so no float ever touches the value.
 * Returns null when the text isn't a valid peso amount with at most two decimals.
 */
export function parseAmountToMinor(input: string): number | null {
  const cleaned = input.replace(/[₱,\s]/g, "");
  const match = /^(\d+)(?:\.(\d{0,2}))?$/.exec(cleaned);
  if (!match) return null;
  const whole = match[1]!;
  const fraction = (match[2] ?? "").padEnd(2, "0");
  const minor = Number(whole) * 100 + Number(fraction);
  return Number.isSafeInteger(minor) ? minor : null;
}
