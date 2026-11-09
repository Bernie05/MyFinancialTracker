import type { CardKind } from "../../shared/contracts";

/** Bank cards live under Credit Cards, online credit lines (SPayLater, Home Credit…) under Online Credit. */
export const cardsHome = (kind: CardKind) => (kind === "online" ? "/online-credit" : "/cards");
export const cardPath = (card: { id: number; kind: CardKind }) => `${cardsHome(card.kind)}/${card.id}`;
