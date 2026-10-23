import { formatMoney } from "@mft/ui";
import { useState } from "react";
import { categoryColor } from "../lib/categoryColor";
import { dismiss, dueText, isDismissed, useAlerts } from "../lib/alerts";
import { linkClick } from "../lib/router";
import { ColorDot } from "./ColorDot";
import { AlertIcon, CloseIcon } from "./icons";

/** The most urgent card reminder, on the Dashboard. Dismissing hides it until that card's next due date. */
export function AlertBanner() {
  const alerts = useAlerts();
  const [, rerender] = useState(0);
  const alert = alerts.find((a) => !isDismissed(a)); // already sorted most urgent first
  if (!alert) return null;
  const overdue = alert.status === "overdue";

  return (
    <section className={`alert-banner${overdue ? " alert-banner--overdue" : ""}`} aria-label="Payment reminder">
      <span className="alert-banner__icon">
        <AlertIcon />
      </span>
      <p className="alert-banner__text">
        <ColorDot color={categoryColor(alert.color)} />
        <strong>{alert.name}</strong> {dueText(alert.daysUntilDue).toLowerCase()}: {formatMoney(alert.remainingDueMinor)} left to pay.
      </p>
      <a className="alert-banner__link" href={`/cards/${alert.cardId}`} onClick={linkClick}>
        View card
      </a>
      <button
        type="button"
        className="icon-button"
        aria-label={`Dismiss the reminder for ${alert.name} until its next due date`}
        onClick={() => {
          dismiss(alert);
          rerender((n) => n + 1);
        }}
      >
        <CloseIcon />
      </button>
    </section>
  );
}
