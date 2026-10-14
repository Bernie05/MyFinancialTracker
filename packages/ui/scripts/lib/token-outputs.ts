/**
 * Pure functions that turn `src/tokens/tokens.ts` into its outputs.
 * Kept free of file I/O so the build scripts stay thin and these stay reusable.
 */
import * as t from "../../src/tokens/tokens";

const decl = (name: string, value: string) => `  --${name}: ${value};`;

function themeBlock(theme: t.ThemeId): string {
  return [
    ...t.color.map((c) => decl(c.name, c.value[theme])),
    ...t.shadow.map((s) => decl(s.name, s.value[theme])),
  ].join("\n");
}

/**
 * tokens.css — custom properties for color, shadow, spacing, radius and the font stack.
 * Light is the default; dark applies via the OS setting unless the app pins a theme
 * with `data-theme` on <html>.
 */
export function tokensCss(fontUrlPrefix: string): string {
  const fontFaces = t.fonts
    .map(
      (f) => `@font-face {
  font-family: "${f.family}";
  src: url("${fontUrlPrefix}${f.file.replace(/^fonts\//, "")}") format("woff");
  font-weight: ${f.weight};
  font-style: ${f.style};
  font-display: swap;
}`,
    )
    .join("\n\n");

  return `/* MyFinancialTracker — generated from src/tokens/tokens.ts. Do not edit by hand. */

${fontFaces}

:root,
[data-theme="light"] {
  color-scheme: light;
${themeBlock("light")}
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
${themeBlock("dark").replace(/^/gm, "  ")}
  }
}

[data-theme="dark"] {
  color-scheme: dark;
${themeBlock("dark")}
}

:root {
${[...t.spacing, ...t.radius].map((s) => decl(s.name, s.value)).join("\n")}
${Object.entries(t.fontFamilies).map(([k, v]) => decl(`font-${k}`, v)).join("\n")}
}
`;
}

/**
 * type.css — the type scale as custom properties (`--type-body-size`, …) that
 * component styles read, plus one utility class per style (`.mft-text-body`).
 */
export function typeCss(): string {
  const vars = t.typeStyles
    .flatMap((s) => [
      decl(`type-${s.name}-size`, s.fontSize),
      decl(`type-${s.name}-line`, s.lineHeight),
      decl(`type-${s.name}-weight`, String(s.fontWeight)),
      decl(`type-${s.name}-tracking`, s.letterSpacing ?? "0"),
    ])
    .join("\n");
  const classes = t.typeStyles
    .map(
      (s) => `.mft-text-${s.name} {
  font-family: var(--font-sans);
  font-size: var(--type-${s.name}-size);
  line-height: var(--type-${s.name}-line);
  font-weight: var(--type-${s.name}-weight);
  letter-spacing: var(--type-${s.name}-tracking);
}`,
    )
    .join("\n\n");
  return `/* MyFinancialTracker type scale — generated from src/tokens/tokens.ts. Do not edit by hand. */

:root {
${vars}
}

${classes}
`;
}

/** tokens.json in the Design System artifact's list shape. */
export function designSystemTokens(meta: Record<string, unknown>) {
  return {
    name: "MyFinancialTracker",
    version: 1,
    meta,
    color: { themes: t.themes, tokens: t.color },
    type: {
      fonts: t.fonts.map((f) => ({ ...f })),
      families: { ...t.fontFamilies },
      groups: [
        {
          name: "Hanken Grotesk",
          family: "sans",
          styles: t.typeStyles.map((s) => ({ ...s })),
        },
      ],
    },
    spacing: { tokens: t.spacing },
    radius: { tokens: t.radius },
    shadow: { tokens: t.shadow },
  };
}
