import { Button, formatMoney, SegmentedControl, Select, TextField } from "@mft/ui";
import { useEffect, useState } from "react";
import type { Person, SplitInput } from "../../../shared/contracts";
import { allocate, normalizeSplit, type SplitMode } from "../../../shared/split";
import { ApiError } from "../../api/client";
import { api } from "../../api/endpoints";
import { useAsync } from "../../lib/useAsync";

/** Everyone you've added (archived too, so an old split still shows names), reloadable after an inline add. */
export function usePeople() {
  const { state, reload } = useAsync(() => api.listPeople(), []);
  return { people: (state.data ?? []) as Person[], reload };
}

/** What's wrong with a split for this amount, if anything (the server checks the same). */
export function splitProblem(split: SplitInput | null, amountMinor: number | null): string | undefined {
  const s = normalizeSplit(split);
  if (!s) return undefined;
  if (s.mode === "amounts") {
    if (s.parts.some((p) => !Number.isFinite(p.value) || p.value < 1)) return "Enter an amount for everyone ticked.";
    const sum = s.parts.reduce((a, p) => a + p.value, 0);
    if (amountMinor !== null && sum !== amountMinor) return `The amounts add up to ${formatMoney(sum)}, but the total is ${formatMoney(amountMinor)}.`;
  }
  if (s.mode === "shares" && s.parts.some((p) => !Number.isInteger(p.value) || p.value < 1 || p.value > 1000)) return "Shares are whole numbers from 1 to 1000.";
  return undefined;
}

interface SplitFieldProps {
  value: SplitInput | null;
  onChange: (split: SplitInput | null) => void;
  /** The total being split, for the preview and the amounts check; null while it's being typed. */
  amountMinor: number | null;
  people: Person[];
  /** After "+ New person…" adds someone, so the parent can reload its list. */
  onPersonAdded?: () => void;
  error?: string;
  label?: string;
}

const ME = "me";
const SPLIT = "split";
const NEW = "new";
const keyOf = (id: number | null) => (id === null ? ME : String(id));
const pesos = (minor: number) => (minor / 100).toFixed(2);

const modes: { value: SplitMode; label: string }[] = [
  { value: "equal", label: "Equally" },
  { value: "shares", label: "By shares" },
  { value: "amounts", label: "By amounts" },
];

/**
 * "For": you, one person, or a split between several (equally, by shares or by exact amounts), with a
 * live preview of each person's part. Centavos are shared out exactly like the server does (shared/split.ts).
 */
export function SplitField({ value, onChange, amountMinor, people, onPersonAdded, error, label = "For" }: SplitFieldProps) {
  const split = normalizeSplit(value);
  const isSplit = split !== null && split.parts.length > 1;
  const single = split && split.parts.length === 1 ? split.parts[0]!.personId : null;
  const derived = isSplit ? SPLIT : single !== null ? String(single) : ME;
  const [choice, setChoice] = useState<string>(derived);
  // Follow changes made from outside (e.g. picking a card that a friend usually uses). While splitting,
  // unticking everyone else leaves just you, which is still the split editor, not "Me".
  useEffect(() => {
    if (choice === SPLIT && value) return;
    setChoice(derived);
  }, [derived, value === null]); // eslint-disable-line react-hooks/exhaustive-deps
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [addBusy, setAddBusy] = useState(false);
  // Amounts as typed (pesos), per person key, so "12." doesn't get reformatted mid-typing.
  const [amountText, setAmountText] = useState<Record<string, string>>(() =>
    split?.mode === "amounts" ? Object.fromEntries(split.parts.map((p) => [keyOf(p.personId), pesos(p.value)])) : {},
  );

  const mentioned = new Set(split?.parts.map((p) => p.personId));
  // Archived people stay listed only where a split already uses them.
  const choices = people.filter((p) => !p.archived || mentioned.has(p.id));
  const nameOf = (id: number | null) => (id === null ? "Me" : (people.find((p) => p.id === id)?.name ?? "Someone"));

  function pick(next: string) {
    if (next === NEW) {
      setAdding(true);
      return;
    }
    setAdding(false);
    setChoice(next);
    if (next === ME) onChange(null);
    else if (next === SPLIT) {
      // Start with you plus whoever it was for (or the first person).
      const other = single ?? choices.find((p) => !p.archived)?.id ?? null;
      onChange({ mode: "equal", parts: other === null ? [{ personId: null, value: 1 }] : [{ personId: null, value: 1 }, { personId: other, value: 1 }] });
    } else onChange({ mode: "equal", parts: [{ personId: Number(next), value: 1 }] });
  }

  async function addPerson() {
    setAddError(null);
    setAddBusy(true);
    try {
      const person = await api.createPerson({ name: newName });
      onPersonAdded?.();
      setAdding(false);
      setNewName("");
      if (choice === SPLIT && split) onChange({ ...split, parts: [...split.parts, { personId: person.id, value: split.mode === "shares" ? 1 : 0 }] });
      else {
        setChoice(String(person.id));
        onChange({ mode: "equal", parts: [{ personId: person.id, value: 1 }] });
      }
    } catch (err) {
      setAddError(err instanceof ApiError ? (err.fields.name ?? err.message) : "Couldn't add them. Try again.");
    } finally {
      setAddBusy(false);
    }
  }

  // Split editor -------------------------------------------------------------
  const current = split ?? { mode: "equal" as SplitMode, parts: [{ personId: null, value: 1 }] };
  const rows: (number | null)[] = [null, ...choices.map((p) => p.id)];
  const included = new Map(current.parts.map((p) => [p.personId, p.value]));
  const preview = amountMinor && current.parts.length > 0 ? allocate(amountMinor, current) : [];
  const previewOf = (id: number | null) => preview.find((a) => a.personId === id)?.amountMinor;

  function setMode(mode: SplitMode) {
    let parts = current.parts.map((p) => ({ personId: p.personId, value: 1 }));
    if (mode === "amounts") {
      // Start from the current preview so switching doesn't lose the numbers.
      parts = current.parts.map((p) => ({ personId: p.personId, value: previewOf(p.personId) ?? 0 }));
      setAmountText(Object.fromEntries(parts.map((p) => [keyOf(p.personId), p.value ? pesos(p.value) : ""])));
    }
    onChange({ mode, parts });
  }

  function toggle(id: number | null, on: boolean) {
    const parts = on
      ? rows.filter((r) => r === id || included.has(r)).map((r) => ({ personId: r, value: included.get(r) ?? (current.mode === "amounts" ? 0 : 1) }))
      : current.parts.filter((p) => p.personId !== id);
    onChange({ ...current, parts: parts.length ? parts : [{ personId: null, value: 1 }] });
  }

  function setValue(id: number | null, text: string) {
    let v: number;
    if (current.mode === "amounts") {
      setAmountText({ ...amountText, [keyOf(id)]: text });
      const cleaned = text.replace(/[₱,\s]/g, "");
      v = /^\d+(\.\d{0,2})?$/.test(cleaned) ? Math.round(Number(cleaned) * 100) : Number.NaN;
    } else v = text.trim() === "" ? Number.NaN : Number(text);
    onChange({ ...current, parts: current.parts.map((p) => (p.personId === id ? { ...p, value: v } : p)) });
  }

  const assigned = current.mode === "amounts" ? current.parts.reduce((a, p) => a + (Number.isFinite(p.value) ? p.value : 0), 0) : 0;

  return (
    <div className="split-field">
      <Select
        label={label}
        value={adding ? NEW : choice}
        onChange={(e) => pick(e.target.value)}
        error={choice === SPLIT ? undefined : error}
        options={[
          { value: ME, label: "Me" },
          ...choices.map((p) => ({ value: String(p.id), label: p.archived ? `${p.name} (archived)` : p.name })),
          ...(choices.some((p) => !p.archived) ? [{ value: SPLIT, label: "Split between people…" }] : []),
          { value: NEW, label: "+ New person…" },
        ]}
      />

      {adding && (
        <div className="split-field__add">
          <TextField label="Name" placeholder="Ana" maxLength={40} value={newName} onChange={(e) => setNewName(e.target.value)} error={addError ?? undefined} />
          <Button type="button" size="sm" onClick={addPerson} loading={addBusy} disabled={!newName.trim()}>
            Add
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>
            Cancel
          </Button>
        </div>
      )}

      {choice === SPLIT && !adding && (
        <fieldset className="split-field__panel">
          <legend className="visually-hidden">Split between</legend>
          <SegmentedControl aria-label="How to split" size="sm" options={modes} value={current.mode} onChange={setMode} />
          <ul className="split-field__rows">
            {rows.map((id) => {
              const on = included.has(id);
              const part = previewOf(id);
              const name = nameOf(id);
              return (
                <li key={keyOf(id)} className={on ? "split-field__row is-on" : "split-field__row"}>
                  <label className="split-field__who">
                    <input type="checkbox" checked={on} onChange={(e) => toggle(id, e.target.checked)} />
                    <span>{name}</span>
                  </label>
                  {on && current.mode === "shares" && (
                    <input
                      className="split-field__input"
                      type="number"
                      min={1}
                      max={1000}
                      value={Number.isFinite(included.get(id)) ? String(included.get(id)) : ""}
                      onChange={(e) => setValue(id, e.target.value)}
                      aria-label={`${name}'s shares`}
                    />
                  )}
                  {on && current.mode === "amounts" && (
                    <span className="split-field__money">
                      <span aria-hidden="true">₱</span>
                      <input
                        className="split-field__input"
                        inputMode="decimal"
                        placeholder="0.00"
                        value={amountText[keyOf(id)] ?? ""}
                        onChange={(e) => setValue(id, e.target.value)}
                        aria-label={`${name}'s amount`}
                      />
                    </span>
                  )}
                  <span className="split-field__part">{on && part !== undefined && current.mode !== "amounts" ? formatMoney(part) : ""}</span>
                </li>
              );
            })}
          </ul>
          {current.mode === "amounts" && amountMinor !== null && (
            <p className={assigned === amountMinor ? "split-field__sum is-ok" : "split-field__sum"}>
              {formatMoney(assigned)} of {formatMoney(amountMinor)}
              {assigned !== amountMinor && ` · ${formatMoney(Math.abs(amountMinor - assigned))} ${assigned < amountMinor ? "left" : "too much"}`}
            </p>
          )}
          {error && (
            <p className="split-field__error" role="alert">
              {error}
            </p>
          )}
        </fieldset>
      )}
    </div>
  );
}
