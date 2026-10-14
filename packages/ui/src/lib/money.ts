/**
 * Money helpers.
 *
 * Amounts travel through the app as INTEGER MINOR UNITS (centavos for PHP,
 * cents for USD). Floats can't represent 0.1 exactly, so summing 0.1 + 0.2
 * pesos in floating point drifts; integers don't. Convert to a decimal only
 * at the edge — when formatting for display.
 */

export type CurrencyCode = string; // ISO 4217, e.g. "PHP", "USD"

export interface MoneyFormatOptions {
  currency?: CurrencyCode;
  locale?: string;
  /** "auto": minus for negatives only. "always": + and −. "never": absolute value. */
  signDisplay?: "auto" | "always" | "never";
}

export interface MoneyParts {
  sign: "" | "+" | "−";
  symbol: string;
  number: string;
  /** Symbol before the number (en-PH: "₱1,000") or after (de-DE: "1.000 €"). */
  symbolFirst: boolean;
  /** The whole string, for aria-labels and titles. */
  text: string;
}

const formatterCache = new Map<string, Intl.NumberFormat>();

function formatterFor(locale: string, currency: CurrencyCode): Intl.NumberFormat {
  const key = `${locale}|${currency}`;
  let f = formatterCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, { style: "currency", currency, signDisplay: "never" });
    formatterCache.set(key, f);
  }
  return f;
}

/** Number of minor units in one major unit for a currency (PHP → 100, JPY → 1). */
export function minorUnitFactor(currency: CurrencyCode, locale = "en-PH"): number {
  const digits = formatterFor(locale, currency).resolvedOptions().maximumFractionDigits ?? 2;
  return 10 ** digits;
}

/** Splits a minor-unit amount into display parts so the UI can style symbol and digits separately. */
export function formatMoneyParts(minorUnits: number, opts: MoneyFormatOptions = {}): MoneyParts {
  const { currency = "PHP", locale = "en-PH", signDisplay = "auto" } = opts;
  const major = minorUnits / minorUnitFactor(currency, locale);
  const parts = formatterFor(locale, currency).formatToParts(Math.abs(major));

  const symbolIndex = parts.findIndex((p) => p.type === "currency");
  const firstNumberIndex = parts.findIndex((p) => p.type === "integer");
  const symbol = parts[symbolIndex]?.value ?? "";
  const number = parts
    .filter((p) => p.type !== "currency" && p.type !== "literal")
    .map((p) => p.value)
    .join("");

  // U+2212 MINUS SIGN: the typographic minus, same width as "+" in most faces.
  const sign: MoneyParts["sign"] =
    signDisplay === "never" || minorUnits === 0
      ? ""
      : minorUnits < 0
        ? "−"
        : signDisplay === "always"
          ? "+"
          : "";

  const symbolFirst = symbolIndex < firstNumberIndex;
  const text = `${sign}${symbolFirst ? symbol + number : `${number} ${symbol}`}`;
  return { sign, symbol, number, symbolFirst, text };
}

/** Formats a minor-unit amount as one string: formatMoney(-125050) → "−₱1,250.50". */
export function formatMoney(minorUnits: number, opts?: MoneyFormatOptions): string {
  return formatMoneyParts(minorUnits, opts).text;
}
