/**
 * Splitting an amount between people. Used by the server (to store each person's share) and the
 * client (to preview it), so both always agree to the centavo.
 *
 * A split is `null` (all yours) or `{ mode, parts }`, where each part is a person (`personId`, or null
 * for you) and a value:
 *   equal   — value ignored; everyone pays the same
 *   shares  — value is a weight: 2 and 1 means two thirds and one third
 *   amounts — value is centavos; they must add up to the amount. Applied to a different amount
 *             (an installment's monthly bill), they act as weights, so each bill splits the same way.
 *
 * Centavos left over after dividing go one each to the parts with the largest remainders (ties: in
 * order), so the parts always add up exactly.
 */

export type SplitMode = "equal" | "shares" | "amounts";

export interface SplitPart {
  /** null = you. */
  personId: number | null;
  value: number;
}

export interface Split {
  mode: SplitMode;
  parts: SplitPart[];
}

export interface Allocation {
  personId: number | null;
  amountMinor: number;
}

/** Divides `amountMinor` by the weights, largest-remainder rounding. */
function byWeights(amountMinor: number, parts: SplitPart[], weights: number[]): Allocation[] {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return parts.map((p, i) => ({ personId: p.personId, amountMinor: i === 0 ? amountMinor : 0 }));
  const exact = weights.map((w) => (amountMinor * w) / total);
  const floors = exact.map(Math.floor);
  let left = amountMinor - floors.reduce((a, b) => a + b, 0);
  const order = exact.map((e, i) => ({ i, r: e - floors[i]! })).sort((a, b) => b.r - a.r || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    floors[i]!++;
    left--;
  }
  return parts.map((p, i) => ({ personId: p.personId, amountMinor: floors[i]! }));
}

/** Each person's share of `amountMinor`. A null split is all yours. */
export function allocate(amountMinor: number, split: Split | null): Allocation[] {
  if (!split || split.parts.length === 0) return [{ personId: null, amountMinor }];
  const { mode, parts } = split;
  if (mode === "amounts") {
    const sum = parts.reduce((a, p) => a + p.value, 0);
    if (sum === amountMinor) return parts.map((p) => ({ personId: p.personId, amountMinor: p.value }));
    return byWeights(amountMinor, parts, parts.map((p) => p.value));
  }
  return byWeights(amountMinor, parts, mode === "equal" ? parts.map(() => 1) : parts.map((p) => p.value));
}

/** Your share (the part with personId null), or 0. */
export const myShare = (amountMinor: number, split: Split | null) =>
  allocate(amountMinor, split).reduce((sum, a) => sum + (a.personId === null ? a.amountMinor : 0), 0);

/** All yours → null; one person → that person's whole amount. Keeps "who it's for" in one shape. */
export function normalizeSplit(split: Split | null | undefined): Split | null {
  if (!split || split.parts.length === 0) return null;
  if (split.parts.length === 1) return split.parts[0]!.personId === null ? null : { mode: "equal", parts: [{ personId: split.parts[0]!.personId, value: 1 }] };
  // Equal ignores the values: store them as 1 so the same split always looks the same.
  return split.mode === "equal" ? { mode: "equal", parts: split.parts.map((p) => ({ personId: p.personId, value: 1 })) } : split;
}

/** The split as text, for the Excel "For" column: "Ana", "Me, Ana", "Me:2, Ana:1", "Me=500.00, Ana=700.00". Blank = all yours. */
export function splitToText(split: Split | null, nameOf: (personId: number) => string) {
  if (!split) return "";
  const name = (id: number | null) => (id === null ? "Me" : nameOf(id));
  return split.parts
    .map((p) => (split.mode === "equal" ? name(p.personId) : split.mode === "shares" ? `${name(p.personId)}:${p.value}` : `${name(p.personId)}=${(p.value / 100).toFixed(2)}`))
    .join(", ");
}

/** Everyone the split mentions, people only (not you). */
export const splitPeople = (split: Split | null) => (split ? split.parts.map((p) => p.personId).filter((id): id is number => id !== null) : []);
