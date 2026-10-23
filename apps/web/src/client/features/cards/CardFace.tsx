import { Badge, type BadgeTone } from "@mft/ui";
import type { CSSProperties } from "react";
import type { Card, CardSummary } from "../../../shared/contracts";
import { categoryColor } from "../../lib/categoryColor";
import { dueText } from "../../lib/alerts";
import { shortDate } from "../../lib/dates";

const SHADE = "#0b0d12";
const MIX = 0.52; // share of the card color in the face; the rest is near-black so white text reads

/**
 * The card face is the user's color darkened toward near-black, with white text. Presets are tuned
 * to stay above 4.5:1 that way; a very light custom color switches the text to ink instead.
 */
function faceStyle(color: string): CSSProperties {
  const base = categoryColor(color);
  const style: CSSProperties = {
    background: `linear-gradient(135deg, color-mix(in srgb, ${base} ${MIX * 100}%, ${SHADE}), color-mix(in srgb, ${base} ${MIX * 70}%, ${SHADE}))`,
    color: "#ffffff",
  };
  if (color.startsWith("#")) {
    const lum = [1, 3, 5]
      .map((i) => (parseInt(color.slice(i, i + 2), 16) * MIX + parseInt(SHADE.slice(i, i + 2), 16) * (1 - MIX)) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i]!, 0);
    if (1.05 / (lum + 0.05) < 4.5) style.color = "#121417";
  }
  return style;
}

/** A card-shaped visual: name, issuer and the last 4 digits. Decorative except for its text. */
export function CardFace({ card, size = "md" }: { card: Card; size?: "md" | "lg" }) {
  return (
    <div className={`card-face card-face--${size}`} style={faceStyle(card.color)}>
      <div className="card-face__top">
        <span className="card-face__issuer">{card.issuer ?? "Credit card"}</span>
        <span className="card-face__chip" aria-hidden="true" />
      </div>
      <span className="card-face__name">{card.name}</span>
      <span className="card-face__number">
        {card.last4 ? (
          <>
            <span aria-hidden="true">•••• </span>
            <span className="visually-hidden">ending in </span>
            {card.last4}
          </>
        ) : (
          <span className="card-face__no-number">No number saved</span>
        )}
      </span>
    </div>
  );
}

const tones: Record<CardSummary["summary"]["status"], BadgeTone> = {
  overdue: "expense",
  due_soon: "goal",
  upcoming: "neutral",
  paid: "income",
};

/** "Due in 4 days" / "Overdue by 2 days" / "Paid" / "Nothing due": text first, color second. */
export function StatusChip({ summary }: { summary: CardSummary["summary"] }) {
  const text =
    summary.status === "paid"
      ? summary.statementMinor > 0
        ? "Paid"
        : "Nothing due"
      : summary.status === "upcoming"
        ? `Due ${shortDate(summary.dueDate)}`
        : dueText(summary.daysUntilDue);
  return <Badge tone={tones[summary.status]}>{text}</Badge>;
}
