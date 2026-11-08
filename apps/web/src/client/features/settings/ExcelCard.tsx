import { Button, Card } from "@mft/ui";
import { useRef, useState, type ChangeEvent } from "react";
import type { ImportReport, ImportRequest } from "../../../shared/importExport";
import { api } from "../../api/endpoints";
import { todayLocal } from "../../lib/dates";
import { buildWorkbook, download, readWorkbook, type SheetRead } from "../../lib/excel";

type Stage =
  | { kind: "idle" }
  | { kind: "preview"; file: string; request: ImportRequest; report: ImportReport; sheets: { transactions: SheetRead; installments: SheetRead } }
  | { kind: "done"; report: ImportReport };

const SHOWN_ERRORS = 50;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function counts(c: ImportReport["transactions"]) {
  const parts = [];
  if (c.added) parts.push(`${c.added} new`);
  if (c.updated) parts.push(`${c.updated} changed`);
  if (c.unchanged) parts.push(`${c.unchanged} unchanged`);
  return parts.length ? parts.join(", ") : "none";
}

/** Export everything to .xlsx, edit it in Excel, import it back: preview first, then apply. */
export function ExcelCard() {
  const input = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [busy, setBusy] = useState<"export" | "template" | "read" | "import" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function exportFile(blank: boolean) {
    setError(null);
    setBusy(blank ? "template" : "export");
    try {
      const data = await api.exportData();
      download(buildWorkbook(data, blank), blank ? "MyFinancialTracker-template.xlsx" : `MyFinancialTracker-${todayLocal()}.xlsx`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't export. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // picking the same file again still triggers a change
    if (!file) return;
    setError(null);
    setStage({ kind: "idle" });
    setBusy("read");
    try {
      let sheets;
      try {
        sheets = readWorkbook(await file.arrayBuffer());
      } catch {
        throw new Error(`${file.name} isn't a spreadsheet this app can read. Use .xlsx, .xls or .csv.`);
      }
      if (!sheets.transactions.sheet && !sheets.installments.sheet) throw new Error(`${file.name} has no sheets.`);
      if (sheets.transactions.rows.length === 0 && sheets.installments.rows.length === 0) {
        const missing = [...sheets.transactions.missing, ...sheets.installments.missing];
        throw new Error(
          missing.length && !sheets.transactions.matched.length && !sheets.installments.matched.length
            ? `Couldn't find the header row in ${file.name}. Use the headers from an export (Date, Description, Amount, Category, …).`
            : `${file.name} has no rows to import.`,
        );
      }
      const request: ImportRequest = { commit: false, transactions: sheets.transactions.rows, installments: sheets.installments.rows };
      const report = await api.importData(request);
      setStage({ kind: "preview", file: file.name, request, report, sheets });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read the file. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function confirm() {
    if (stage.kind !== "preview") return;
    setError(null);
    setBusy("import");
    try {
      const report = await api.importData({ ...stage.request, commit: true });
      // Someone may have changed data in between: show the fresh problems instead.
      setStage(report.committed ? { kind: "done", report } : { ...stage, report });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't import. Try again.");
    } finally {
      setBusy(null);
    }
  }

  const preview = stage.kind === "preview" ? stage : null;
  const changes = preview
    ? preview.report.transactions.added + preview.report.transactions.updated + preview.report.installments.added + preview.report.installments.updated
    : 0;

  return (
    <Card title="Excel export and import" subtitle="Download your transactions and installment plans, edit them in Excel, and import them back.">
      <div className="excel">
        <div className="excel__actions">
          <Button onClick={() => exportFile(false)} loading={busy === "export"} disabled={busy !== null && busy !== "export"}>
            Export to Excel
          </Button>
          <Button variant="secondary" onClick={() => input.current?.click()} loading={busy === "read"} disabled={busy !== null && busy !== "read"}>
            Import from Excel
          </Button>
          <button type="button" className="link-text" onClick={() => exportFile(true)} disabled={busy !== null}>
            {busy === "template" ? "Preparing…" : "Blank template"}
          </button>
          <input ref={input} type="file" accept=".xlsx,.xls,.csv" hidden onChange={onFile} aria-label="Choose a spreadsheet to import" />
        </div>
        <p className="excel__hint">
          Rows with an ID update what's already here; rows without one are added. New category and subcategory names are created
          for you. Nothing is saved until you confirm, and nothing is ever deleted.
        </p>

        {error && (
          <p className="add-form__error" role="alert">
            {error}
          </p>
        )}

        {preview && (
          <section className="excel__preview" aria-label="Import preview" aria-live="polite">
            <h3>{preview.file}</h3>
            <dl>
              <dt>Transactions</dt>
              <dd>{preview.sheets.transactions.sheet ? counts(preview.report.transactions) : "no Transactions sheet"}</dd>
              <dt>Installments</dt>
              <dd>{preview.sheets.installments.sheet ? counts(preview.report.installments) : "no Installments sheet"}</dd>
              {preview.report.newPeople.length > 0 && (
                <>
                  <dt>New people</dt>
                  <dd>{preview.report.newPeople.join(", ")}</dd>
                </>
              )}
              {preview.report.newCategories.length > 0 && (
                <>
                  <dt>New categories</dt>
                  <dd>{preview.report.newCategories.map((c) => (c.type === "income" ? `${c.path} (income)` : c.path)).join(", ")}</dd>
                </>
              )}
            </dl>
            {(["transactions", "installments"] as const).map((key) => {
              const s = preview.sheets[key];
              if (!s.sheet || (s.ignored.length === 0 && s.missing.length === 0)) return null;
              return (
                <p key={key} className="excel__columns">
                  {s.sheet}:{s.missing.length > 0 && <> missing column{s.missing.length === 1 ? "" : "s"} {s.missing.join(", ")}.</>}
                  {s.ignored.length > 0 && <> ignored column{s.ignored.length === 1 ? "" : "s"} {s.ignored.join(", ")}.</>}
                </p>
              );
            })}

            {preview.report.errors.length > 0 && (
              <div className="excel__errors" role="alert">
                <p>
                  <strong>
                    {plural(preview.report.errors.length, "row")} {preview.report.errors.length === 1 ? "needs" : "need"} fixing
                  </strong> before anything can be imported. Fix them in Excel,
                  save, and import the file again.
                </p>
                <ul>
                  {preview.report.errors.slice(0, SHOWN_ERRORS).map((e) => (
                    <li key={`${e.sheet}-${e.row}`}>
                      <span>
                        {e.sheet} row {e.row}
                      </span>{" "}
                      {e.message}
                    </li>
                  ))}
                </ul>
                {preview.report.errors.length > SHOWN_ERRORS && <p>…and {preview.report.errors.length - SHOWN_ERRORS} more.</p>}
              </div>
            )}

            <div className="dialog__actions">
              <Button variant="secondary" onClick={() => setStage({ kind: "idle" })} disabled={busy === "import"}>
                Cancel
              </Button>
              <Button onClick={confirm} loading={busy === "import"} disabled={preview.report.errors.length > 0 || changes === 0}>
                {preview.report.errors.length > 0 ? "Import" : changes === 0 ? "Nothing to change" : `Import ${plural(changes, "change")}`}
              </Button>
            </div>
          </section>
        )}

        {stage.kind === "done" && (
          <p className="settings__ok" role="status">
            Imported. Transactions: {counts(stage.report.transactions)}. Installments: {counts(stage.report.installments)}.
            {stage.report.newCategories.length > 0 &&
              ` Created ${stage.report.newCategories.length} ${stage.report.newCategories.length === 1 ? "category" : "categories"}.`}
          </p>
        )}
      </div>
    </Card>
  );
}
