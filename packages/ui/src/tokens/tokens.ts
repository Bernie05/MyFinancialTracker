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
  // Surfaces: cool, quiet neutrals so money and the one accent carry the colour.
  { name: "surface", value: { light: "#f4f5f7", dark: "#0d0f12" }, usage: "Page background behind every screen, and the sidebar." },
  { name: "surface-raised", value: { light: "#ffffff", dark: "#16191e" }, usage: "Cards, inputs, sheets: anything that sits on `surface`." },
  { name: "surface-sunken", value: { light: "#ebedf1", dark: "#0a0b0d" }, usage: "Wells and tracks: meter tracks, the segmented-control groove, skeletons, row hover." },
  { name: "line", value: { light: "#e3e6eb", dark: "#252a31" }, usage: "Decorative hairlines: row dividers, dark-mode card outlines. Never the only boundary of a control." },
  { name: "line-strong", value: { light: "#868e9c", dark: "#5f6877" }, usage: "Control borders (inputs, secondary buttons). Holds 3:1 on `surface` and `surface-raised`." },

  // Text
  { name: "ink", value: { light: "#121417", dark: "#eef0f3" }, usage: "Primary text and amounts on every surface." },
  { name: "ink-muted", value: { light: "#5a6170", dark: "#a3aab6" }, usage: "Secondary text: dates, hints, labels, captions on any surface (4.5:1 on sunken too)." },

  // Accent: one strong cobalt. Primary actions, the active nav item, links, the hero card.
  { name: "accent", value: { light: "#2550d9", dark: "#7b9bff" }, usage: "The brand accent. Primary button fill, selected states, links, the dashboard hero." },
  { name: "accent-hover", value: { light: "#1c40b5", dark: "#9ab3ff" }, usage: "Hover and pressed fill for anything filled with `accent`." },
  { name: "on-accent", value: { light: "#ffffff", dark: "#0a1235" }, usage: "Text and icons on an `accent` fill." },
  { name: "on-accent-muted", value: { light: "#dbe3ff", dark: "#1d2a5c" }, usage: "Secondary text on an `accent` fill (4.5:1)." },
  { name: "accent-soft", value: { light: "#e8edfd", dark: "#1b2445" }, usage: "Quiet accent tint: active nav item, selected segment, icon wells. `accent` and `ink` read on it." },

  // Savings goals and warnings (near or over a limit).
  { name: "marigold", value: { light: "#e2a52b", dark: "#e8b54d" }, usage: "Savings goals and near-limit fills. A fill, never text." },
  { name: "on-marigold", value: { light: "#2a1d00", dark: "#2a1d00" }, usage: "Text on a `marigold` fill." },
  { name: "marigold-ink", value: { light: "#8a5a00", dark: "#f0c565" }, usage: "Warning and goal text on `surface` and `surface-raised`." },
  { name: "marigold-soft", value: { light: "#fcf1d9", dark: "#3a2e12" }, usage: "Warning/goal badge ground; `marigold-ink` reads on it." },

  // Money direction (success / danger). Always paired with a sign (+ / −) or an arrow, never color alone.
  { name: "income", value: { light: "#0e7a4f", dark: "#4cc38a" }, usage: "Money in (success): positive amounts and income text, on `surface` and `surface-raised`." },
  { name: "income-soft", value: { light: "#e3f4ec", dark: "#12301f" }, usage: "Income badge ground; `income` reads on it." },
  { name: "expense", value: { light: "#c42f2f", dark: "#ff7b7b" }, usage: "Danger: over-budget, errors and destructive actions, on `surface` and `surface-raised`." },
  { name: "expense-hover", value: { light: "#a32626", dark: "#ff9b9b" }, usage: "Hover fill for a destructive button." },
  { name: "on-expense", value: { light: "#ffffff", dark: "#2a0707" }, usage: "Text on an `expense` fill." },
  { name: "expense-soft", value: { light: "#fdeeee", dark: "#3a1717" }, usage: "Expense/error badge ground; `expense` reads on it." },

  // Focus
  { name: "focus", value: { light: "#2550d9", dark: "#7b9bff" }, usage: "The 2px focus ring, offset 2px. Holds 3:1 on every surface." },

  // Charts: categorical, fixed order, validated for color-vision deficiency on both surfaces.
  { name: "chart-1", value: { light: "#2a78d6", dark: "#3987e5" }, usage: "Chart series 1 (blue). Spending categories are assigned in this fixed order." },
  { name: "chart-2", value: { light: "#e0a526", dark: "#c08410" }, usage: "Chart series 2 (marigold). Below 3:1 in light: label it directly." },
  { name: "chart-3", value: { light: "#1f8a68", dark: "#199e70" }, usage: "Chart series 3 (green)." },
  { name: "chart-4", value: { light: "#d0582a", dark: "#d95926" }, usage: "Chart series 4 (orange)." },
  { name: "chart-5", value: { light: "#8a63c9", dark: "#9085e9" }, usage: "Chart series 5 (violet)." },
  { name: "chart-6", value: { light: "#e87ba4", dark: "#d55181" }, usage: "Chart series 6 (pink). Below 3:1 in light: label it directly. A seventh category folds into Other." },
  // Category colors the user picks. Each tuned per theme; six reuse the chart-1…6 values so
  // pre-existing categories look the same. Not validated as a set: any two may sit side by side,
  // so category marks always print their name and value as text, and chips keep ink text.
  { name: "cat-red", value: { light: "#cf3a3a", dark: "#e5534b" }, usage: "Category color: red." },
  { name: "cat-orange", value: { light: "#d0582a", dark: "#d95926" }, usage: "Category color: orange (= chart-4)." },
  { name: "cat-amber", value: { light: "#e0a526", dark: "#c08410" }, usage: "Category color: amber (= chart-2)." },
  { name: "cat-yellow", value: { light: "#d4b106", dark: "#e0c341" }, usage: "Category color: yellow. Low contrast on light surfaces: a fill, never text." },
  { name: "cat-green", value: { light: "#1f8a68", dark: "#199e70" }, usage: "Category color: green (= chart-3)." },
  { name: "cat-teal", value: { light: "#0f8b9c", dark: "#22a6b8" }, usage: "Category color: teal." },
  { name: "cat-blue", value: { light: "#2a78d6", dark: "#3987e5" }, usage: "Category color: blue (= chart-1)." },
  { name: "cat-indigo", value: { light: "#4f5bd5", dark: "#7480f0" }, usage: "Category color: indigo." },
  { name: "cat-purple", value: { light: "#8a63c9", dark: "#9085e9" }, usage: "Category color: purple (= chart-5)." },
  { name: "cat-pink", value: { light: "#e87ba4", dark: "#d55181" }, usage: "Category color: pink (= chart-6)." },
  { name: "cat-brown", value: { light: "#8d6142", dark: "#a87b58" }, usage: "Category color: brown." },
  { name: "cat-grey", value: { light: "#7a8494", dark: "#8b95a5" }, usage: "Category color: grey." },
  { name: "chart-income", value: { light: "#0e7a4f", dark: "#1f9e66" }, usage: "Income marks in income-vs-expense charts. CVD ΔE sits in the 6-8 band (7.7 light, 7.4 dark), so always ship the legend, fixed order and table." },
  { name: "chart-expense", value: { light: "#c42f2f", dark: "#ef5a5a" }, usage: "Expense marks in income-vs-expense charts." },
];

export const fontFamilies = {
  sans: '"Hanken Grotesk", "Hanken Grotesk Variable", system-ui, -apple-system, "Segoe UI", sans-serif',
} as const;

export const fonts = [
  { family: "Hanken Grotesk", file: "fonts/HankenGrotesk-Variable.woff", weight: "100 900", style: "normal" },
  { family: "Hanken Grotesk", file: "fonts/HankenGrotesk-Italic-Variable.woff", weight: "100 900", style: "italic" },
] as const;

/** A modular scale (about 1.25) anchored at 15px body copy. Money always sets tabular figures. */
export const typeStyles: TypeStyle[] = [
  { name: "display", fontSize: "48px", lineHeight: "52px", fontWeight: 700, letterSpacing: "-0.035em", usage: "The one big number on a screen: what's left this month." },
  { name: "title-1", fontSize: "30px", lineHeight: "36px", fontWeight: 700, letterSpacing: "-0.025em", usage: "Screen titles." },
  { name: "title-2", fontSize: "17px", lineHeight: "24px", fontWeight: 650, letterSpacing: "-0.01em", usage: "Card titles and section heads." },
  { name: "amount", fontSize: "26px", lineHeight: "32px", fontWeight: 700, letterSpacing: "-0.025em", usage: "Stat-tile figures and other secondary totals." },
  { name: "body", fontSize: "15px", lineHeight: "22px", fontWeight: 400, usage: "Default text, transaction descriptions." },
  { name: "body-strong", fontSize: "15px", lineHeight: "22px", fontWeight: 600, usage: "Row amounts, emphasised values inside body text." },
  { name: "label", fontSize: "13px", lineHeight: "18px", fontWeight: 550, usage: "Field labels, small button text, chips." },
  { name: "caption", fontSize: "12px", lineHeight: "16px", fontWeight: 450, usage: "Dates, hints, chart axes." },
];

export const spacing: ScalarToken[] = [
  { name: "space-1", value: "4px", usage: "Icon-to-text gap, chip padding." },
  { name: "space-2", value: "8px", usage: "Gap between related controls; label to field." },
  { name: "space-3", value: "12px", usage: "Control inner padding; row padding." },
  { name: "space-4", value: "16px", usage: "Card padding on mobile; gap between cards on mobile." },
  { name: "space-5", value: "24px", usage: "Card padding on desktop; gap between cards." },
  { name: "space-6", value: "32px", usage: "Gap between screen sections." },
  { name: "space-7", value: "48px", usage: "Screen top margin on desktop." },
];

export const radius: ScalarToken[] = [
  { name: "radius-sm", value: "12px", usage: "Inputs, selects, segmented control, nav items." },
  { name: "radius-md", value: "20px", usage: "Cards and sheets." },
  { name: "radius-lg", value: "28px", usage: "The one hero surface per screen." },
  { name: "radius-pill", value: "999px", usage: "Buttons, chips and meter tracks." },
];

export const shadow: { name: string; value: Record<ThemeId, string>; usage: string }[] = [
  {
    name: "shadow-card",
    value: {
      light: "0 1px 2px rgba(18, 20, 23, 0.04), 0 2px 8px rgba(18, 20, 23, 0.04)",
      dark: "0 0 0 1px #252a31",
    },
    usage: "Resting cards: a soft lift in light, a hairline outline in dark (shadows don't read on dark).",
  },
  {
    name: "shadow-raised",
    value: {
      light: "0 2px 4px rgba(18, 20, 23, 0.06), 0 12px 32px rgba(18, 20, 23, 0.12)",
      dark: "0 0 0 1px #2f353e, 0 12px 32px rgba(0, 0, 0, 0.55)",
    },
    usage: "Floating layers only: tooltips, the mobile drawer, popovers.",
  },
];
