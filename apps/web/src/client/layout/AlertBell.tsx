import { formatMoney } from "@mft/ui";
import { useEffect, useId, useRef, useState } from "react";
import { categoryColor } from "../lib/categoryColor";
import { dueText, useAlerts } from "../lib/alerts";
import { linkClick } from "../lib/router";
import { ColorDot } from "./ColorDot";
import { BellIcon } from "./icons";

/** Bell with a count badge; opens a small list of cards that are due soon or overdue. */
export function AlertBell() {
  const alerts = useAlerts();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const count = alerts.length;

  // Close on Escape (focus back to the bell) or a click outside.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    const onClick = (e: MouseEvent) => {
      if (!panel.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  return (
    <div className="bell">
      <button
        ref={button}
        type="button"
        className="icon-button"
        aria-label={count === 0 ? "Reminders: none" : `Reminders: ${count} card${count === 1 ? "" : "s"} due`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        <BellIcon />
        {count > 0 && (
          <span className="bell__badge" aria-hidden="true">
            {count}
          </span>
        )}
      </button>
      {open && (
        <div ref={panel} id={panelId} className="bell__panel">
          <p className="bell__title">Reminders</p>
          {count === 0 ? (
            <p className="bell__empty">No cards are due soon. You'll see a reminder here before a due date.</p>
          ) : (
            <ul className="bell__list">
              {alerts.map((a) => (
                <li key={a.cardId}>
                  <a href={`/cards/${a.cardId}`} className={`bell__item bell__item--${a.status}`} onClick={(e) => { linkClick(e); setOpen(false); }}>
                    <ColorDot color={categoryColor(a.color)} />
                    <span>
                      <strong>{a.name}</strong> {dueText(a.daysUntilDue).toLowerCase()}: {formatMoney(a.remainingDueMinor)}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
