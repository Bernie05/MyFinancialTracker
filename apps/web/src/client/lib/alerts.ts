import { useSyncExternalStore } from "react";
import type { CardAlert } from "../../shared/contracts";
import { api } from "../api/endpoints";

/**
 * Due-date alerts, shared by the top-bar bell and the Dashboard banner. One fetch serves both;
 * call refreshAlerts() after anything that can change what's owed (a payment, a card expense, a card edit).
 */
let alerts: CardAlert[] = [];
const listeners = new Set<() => void>();

export async function refreshAlerts() {
  try {
    alerts = await api.getAlerts();
  } catch {
    return; // keep the last known alerts; a failed refresh shouldn't blank the bell
  }
  listeners.forEach((l) => l());
}

export const useAlerts = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => alerts,
  );

/** "Due in 3 days", "Due today", "Overdue by 2 days". */
export function dueText(daysUntilDue: number) {
  if (daysUntilDue === 0) return "Due today";
  if (daysUntilDue === 1) return "Due tomorrow";
  if (daysUntilDue > 0) return `Due in ${daysUntilDue} days`;
  const late = -daysUntilDue;
  return `Overdue by ${late} day${late === 1 ? "" : "s"}`;
}

const dismissKey = (a: CardAlert) => `mft:alert-dismissed:${a.cardId}:${a.dueDate}`;
/** A dismissed banner stays hidden for that due date only; the next statement can alert again. */
export const isDismissed = (a: CardAlert) => localStorage.getItem(dismissKey(a)) === "1";
export const dismiss = (a: CardAlert) => localStorage.setItem(dismissKey(a), "1");
