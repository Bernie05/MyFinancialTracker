/**
 * @mft/ui — MyFinancialTracker's design system.
 *
 * Import the styles once at the app root:
 *   import "@mft/ui/tokens.css";   // custom properties + fonts
 *   import "@mft/ui/styles.css";   // type scale + component styles
 */
import "./tokens/type.css";

export * from "./components/Amount";
export * from "./components/Badge";
export * from "./components/Button";
export * from "./components/Card";
export * from "./components/ProgressMeter";
export * from "./components/SegmentedControl";
export * from "./components/Select";
export * from "./components/StatTile";
export * from "./components/TextField";
export * from "./components/TransactionRow";

export { formatMoney, formatMoneyParts, minorUnitFactor } from "./lib/money";
export type { CurrencyCode, MoneyFormatOptions, MoneyParts } from "./lib/money";
