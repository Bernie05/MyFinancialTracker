/** A stored category color as CSS: preset keys become their theme-aware token, custom hex passes through. */
export const categoryColor = (color: string) => (color.startsWith("#") ? color : `var(--cat-${color})`);

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

/**
 * Which theme a custom color nearly disappears in (below 1.5:1 against the card surface), if any.
 * Text never uses the category color, so this only affects how visible dots and bars are.
 */
export function faintIn(hex: string): "light" | "dark" | null {
  if (contrast(hex, "#ffffff") < 1.5) return "light";
  if (contrast(hex, "#16191e") < 1.5) return "dark";
  return null;
}
