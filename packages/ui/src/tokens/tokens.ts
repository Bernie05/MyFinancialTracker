/**
 * Design tokens — the single source of truth for MyFinancialTracker.
 *
 * Everything visual (tokens.css, the component styles' type variables and the
 * design-system export) is generated from this file by `scripts/build-tokens.ts`.
 * Edit values here, never in the generated CSS.
 *
 * Shape: every family is a flat LIST of `{ name, value, usage }` entries, so a
 * token's name, value and intent travel together. Colors carry one value per theme.
 */

export type ThemeId = "light" | "dark";

export interface ColorToken {
  name: string;
  value: Record<ThemeId, string>;
  usage: string;
}

export interface ScalarToken {
  name: string;
  value: string;
  usage: string;
}

export interface TypeStyle {
  name: string;
  fontSize: string;
  lineHeight: string;
  fontWeight: number;
  letterSpacing?: string;
  usage: string;
}

export const themes: { id: ThemeId; name: string }[] = [
  { id: "light", name: "Light" },
  { id: "dark", name: "Dark" },
];

export const color: ColorToken[] = [
  // Surfaces
  { name: "surface", value: { light: "#f4f7f5", dark: "#0f1714" }, usage: "Page background behind every screen." },
  { name: "surface-raised", value: { light: "#ffffff", dark: "#16201c" }, usage: "Cards, inputs, sheets: anything that sits on `surface`." },
  { name: "surface-sunken", value: { light: "#e7eeea", dark: "#0b110f" }, usage: "Wells and tracks: meter tracks, the segmented-control groove, table header bands." },
  { name: "line", value: { light: "#d3ddd8", dark: "#26332e" }, usage: "Decorative hairlines: card outlines and row dividers. Never the only boundary of a control." },
  { name: "line-strong", value: { light: "#7d9188", dark: "#62786e" }, usage: "Control borders (inputs, secondary buttons). Holds 3:1 on `surface` and `surface-raised`." },

  // Text
  { name: "ink", value: { light: "#13221d", dark: "#e4ece8" }, usage: "Primary text and amounts on `surface`, `surface-raised` and `surface-sunken`." },
  { name: "ink-muted", value: { light: "#4c5f58", dark: "#9fb2aa" }, usage: "Secondary text: dates, hints, labels, captions on any surface." },

  // Brand
  { name: "pine", value: { light: "#1d5a47", dark: "#5fbf9b" }, usage: "The brand color. Primary button fill, selected states, budget meter fill, links." },
  { name: "pine-hover", value: { light: "#16483a", dark: "#7fd0b1" }, usage: "Hover and pressed fill for anything filled with `pine`." },
  { name: "on-pine", value: { light: "#ffffff", dark: "#0a1a14" }, usage: "Text and icons on a `pine` fill." },
  { name: "pine-soft", value: { light: "#dcebe4", dark: "#1b3a2f" }, usage: "Quiet brand tint: selected segment, neutral badge ground. `ink` reads on it." },

  // Savings goals
  { name: "marigold", value: { light: "#e0a526", dark: "#e3b04a" }, usage: "Savings goals only: goal meter fill and goal marks. A fill, never text." },
  { name: "on-marigold", value: { light: "#2a1d00", dark: "#2a1d00" }, usage: "Text on a `marigold` fill." },
  { name: "marigold-ink", value: { light: "#7a5300", dark: "#e9bd5e" }, usage: "Goal text and the near-limit budget warning on `surface` and `surface-raised`." },
  { name: "marigold-soft", value: { light: "#fbf0d4", dark: "#3a2f14" }, usage: "Goal badge ground; `marigold-ink` reads on it." },

  // Money direction — blue vs orange so they differ for color-blind readers;
  // always paired with a sign (+ / −) or an arrow, never color alone.
  { name: "income", value: { light: "#1f5fae", dark: "#7db0f0" }, usage: "Money in: positive amounts and income marks, on `surface` and `surface-raised`." },
  { name: "income-soft", value: { light: "#e1ecf9", dark: "#182a40" }, usage: "Income badge ground; `income` reads on it." },
  { name: "expense", value: { light: "#b3441a", dark: "#f0916a" }, usage: "Money out: negative amounts, over-budget state, destructive actions, on `surface` and `surface-raised`." },
  { name: "expense-hover", value: { light: "#933612", dark: "#f5a888" }, usage: "Hover fill for a destructive button." },
  { name: "on-expense", value: { light: "#ffffff", dark: "#2a0e03" }, usage: "Text on an `expense` fill." },
  { name: "expense-soft", value: { light: "#f9e5dc", dark: "#3d2219" }, usage: "Expense badge ground; `expense` reads on it." },

  // Focus
  { name: "focus", value: { light: "#1f5fae", dark: "#8bb8f2" }, usage: "The 2px focus ring, offset 2px. Holds 3:1 on every surface." },

  // Charts — categorical, fixed order, validated for color-vision deficiency.
  { name: "chart-1", value: { light: "#2a78d6", dark: "#3987e5" }, usage: "Chart series 1 (blue). Spending categories are assigned in this fixed order." },
  { name: "chart-2", value: { light: "#e0a526", dark: "#c08410" }, usage: "Chart series 2 (marigold). Below 3:1 in light: label it directly." },
  { name: "chart-3", value: { light: "#1f8a68", dark: "#199e70" }, usage: "Chart series 3 (green)." },
  { name: "chart-4", value: { light: "#d0582a", dark: "#d95926" }, usage: "Chart series 4 (orange)." },
  { name: "chart-5", value: { light: "#8a63c9", dark: "#9085e9" }, usage: "Chart series 5 (violet)." },
  { name: "chart-6", value: { light: "#e87ba4", dark: "#d55181" }, usage: "Chart series 6 (pink). Below 3:1 in light: label it directly. A seventh category folds into Other." },
];

export const fontFamilies = {
  sans: '"Hanken Grotesk", "Hanken Grotesk Variable", system-ui, -apple-system, "Segoe UI", sans-serif',
} as const;

export const fonts = [
  { family: "Hanken Grotesk", file: "fonts/HankenGrotesk-Variable.woff", weight: "100 900", style: "normal" },
  { family: "Hanken Grotesk", file: "fonts/HankenGrotesk-Italic-Variable.woff", weight: "100 900", style: "italic" },
] as const;

/** A modular scale (≈1.2 minor third) anchored at 15px body copy. */
export const typeStyles: TypeStyle[] = [
  { name: "display", fontSize: "44px", lineHeight: "48px", fontWeight: 700, letterSpacing: "-0.02em", usage: "The one big number on a screen: total balance, net worth." },
  { name: "title-1", fontSize: "28px", lineHeight: "34px", fontWeight: 650, letterSpacing: "-0.01em", usage: "Screen titles." },
  { name: "title-2", fontSize: "20px", lineHeight: "26px", fontWeight: 600, usage: "Card titles and section heads." },
  { name: "amount", fontSize: "24px", lineHeight: "30px", fontWeight: 650, letterSpacing: "-0.01em", usage: "Stat-tile figures and other secondary totals." },
  { name: "body", fontSize: "15px", lineHeight: "22px", fontWeight: 400, usage: "Default text, transaction descriptions." },
  { name: "body-strong", fontSize: "15px", lineHeight: "22px", fontWeight: 600, usage: "Row amounts, emphasised values inside body text." },
  { name: "label", fontSize: "13px", lineHeight: "18px", fontWeight: 500, usage: "Field labels, button text at small size, badges." },
  { name: "caption", fontSize: "12px", lineHeight: "16px", fontWeight: 400, usage: "Dates, hints, chart axes." },
];

export const spacing: ScalarToken[] = [
  { name: "space-1", value: "4px", usage: "Icon-to-text gap, badge padding." },
  { name: "space-2", value: "8px", usage: "Gap between related controls; label to field." },
  { name: "space-3", value: "12px", usage: "Control inner padding; row padding." },
  { name: "space-4", value: "16px", usage: "Card padding on mobile; gap between rows of cards." },
  { name: "space-5", value: "24px", usage: "Card padding on desktop; gap between cards." },
  { name: "space-6", value: "32px", usage: "Gap between screen sections." },
  { name: "space-7", value: "48px", usage: "Screen top margin on desktop." },
];

export const radius: ScalarToken[] = [
  { name: "radius-sm", value: "6px", usage: "Buttons, inputs, segmented control." },
  { name: "radius-md", value: "12px", usage: "Cards and sheets." },
  { name: "radius-pill", value: "999px", usage: "Badges and meter tracks." },
];

export const shadow: { name: string; value: Record<ThemeId, string>; usage: string }[] = [
  {
    name: "shadow-raised",
    value: {
      light: "0 1px 2px rgba(19, 34, 29, 0.06), 0 4px 12px rgba(19, 34, 29, 0.05)",
      dark: "0 1px 2px rgba(0, 0, 0, 0.5)",
    },
    usage: "Floating layers only (menus, popovers, toasts). Cards sit flat with a `line` outline.",
  },
];
