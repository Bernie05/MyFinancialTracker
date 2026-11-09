import { Amount, Button, Card, formatMoney } from "@mft/ui";
import { useState } from "react";
import type { SalaryProfile } from "../../../shared/contracts";
import { deductionLabels, salaryBreakdown, statutoryKinds } from "../../../shared/salary";
import { api } from "../../api/endpoints";
import { EmptyState } from "../../layout/EmptyState";
import { PencilIcon, SalaryIcon } from "../../layout/icons";
import { Loadable } from "../../layout/Loadable";
import { PageHeader } from "../../layout/PageHeader";
import { useAsync } from "../../lib/useAsync";
import { SalaryForm } from "./SalaryForm";
import { SalaryReceived } from "./SalaryReceived";

const pct = (part: number, whole: number) => (whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : "—");

/** Your pay at a glance (annual, monthly, take-home and each statutory deduction), and where to set it up. */
export function SalaryPage() {
  const salary = useAsync(() => api.getSalary(), []);
  const [editing, setEditing] = useState(false);
  const profile = salary.state.data?.profile;

  return (
    <div className="page">
      <PageHeader
        back={{ href: "/income", label: "Income" }}
        title="My Salary"
        subtitle="Gross pay, what comes off each payslip, and what you take home"
        actions={
          profile && !editing ? (
            <Button variant="secondary" iconStart={<PencilIcon />} onClick={() => setEditing(true)}>
              Edit salary
            </Button>
          ) : undefined
        }
      />
      <Loadable state={salary.state} reload={salary.reload} what="your salary" skeleton="bars">
        {({ profile }) =>
          editing || !profile ? (
            <>
              {!profile && !editing && (
                <EmptyState icon={<SalaryIcon />} heading="Set up your salary">
                  Enter your gross pay per month or per year, then what comes off each payslip. Your tax, SSS, PhilHealth and Pag-IBIG show up here.
                </EmptyState>
              )}
              <SalaryForm
                initial={profile}
                onCancel={profile ? () => setEditing(false) : undefined}
                onSaved={() => {
                  setEditing(false);
                  salary.reload();
                }}
              />
            </>
          ) : (
            <SalaryOverview profile={profile} />
          )
        }
      </Loadable>
      {!editing && salary.state.data && (
        <div className="salary__received">
          <SalaryReceived expectedMonthlyMinor={profile ? salaryBreakdown(profile).monthlyNetMinor : null} />
        </div>
      )}
    </div>
  );
}

function SalaryOverview({ profile }: { profile: SalaryProfile }) {
  const b = salaryBreakdown(profile);
  const rows = [
    ...statutoryKinds.map((kind) => ({ key: kind, name: deductionLabels[kind], monthly: b.byKind[kind], tone: kind })),
    ...b.others.map((d, i) => ({ key: `other-${i}`, name: d.name, monthly: d.amountMinor, tone: "other" as const })),
  ];
  const statutoryTiles = statutoryKinds.map((kind) => (
    <div key={kind} className={`mft-stat mft-stat--lg salary-tile salary-tile--${kind}`}>
      <p className="mft-stat__label">{deductionLabels[kind]}</p>
      <Amount minorUnits={b.byKind[kind]} size="lg" tone="neutral" />
      <p className="period-tile__year">
        <span>Per year</span> <Amount minorUnits={b.byKind[kind] * 12} size="sm" tone="neutral" />
      </p>
    </div>
  ));

  return (
    <div className="salary">
      <div className="salary__headline">
        <section className="hero salary__hero" aria-label="Take-home pay">
          <p className="hero__label">Take-home pay per month</p>
          <Amount className="hero__amount" minorUnits={b.monthlyNetMinor} size="display" tone="neutral" />
          <p className="hero__note">
            {formatMoney(b.monthlyDeductionsMinor)} ({pct(b.monthlyDeductionsMinor, b.monthlyGrossMinor)}) comes off your gross pay each month.
          </p>
          <dl className="hero__split">
            <div>
              <dt>Take-home per year</dt>
              <dd>
                <Amount minorUnits={b.annualNetMinor} size="md" tone="neutral" />
              </dd>
            </div>
            <div>
              <dt>Entered</dt>
              <dd>{profile.basis === "monthly" ? "Per month" : "Per year"}</dd>
            </div>
          </dl>
        </section>
        <div className="overview__tiles">
          <div className="mft-stat mft-stat--lg">
            <p className="mft-stat__label">Annual salary (gross)</p>
            <Amount minorUnits={b.annualGrossMinor} size="lg" tone="neutral" />
            <p className="period-tile__year">12 monthly payslips; 13th-month pay not included</p>
          </div>
          <div className="mft-stat mft-stat--lg">
            <p className="mft-stat__label">Monthly salary (gross)</p>
            <Amount minorUnits={b.monthlyGrossMinor} size="lg" tone="neutral" />
            <p className="period-tile__year">
              <span>Each half-month payday</span> <Amount minorUnits={Math.round(b.monthlyGrossMinor / 2)} size="sm" tone="neutral" />
            </p>
          </div>
        </div>
      </div>

      <h2 className="salary__section-title">Deducted from your salary each month</h2>
      <div className="salary__tiles">{statutoryTiles}</div>

      <Card title="Payslip breakdown" subtitle="Per month and per year, with each deduction's share of your gross pay" padding="none">
        {/* Where each peso of gross pay goes, as one bar. Every value is also in the table. */}
        <div className="salary-bar" aria-hidden="true">
          <span className="salary-bar__part salary-bar__part--net" style={{ flexGrow: Math.max(0, b.monthlyNetMinor) }} />
          {rows
            .filter((r) => r.monthly > 0)
            .map((r) => (
              <span key={r.key} className={`salary-bar__part salary-bar__part--${r.tone}`} style={{ flexGrow: r.monthly }} />
            ))}
        </div>
        <div className="table-scroll">
          <table className="salary-table">
            <thead>
              <tr>
                <th scope="col">Item</th>
                <th scope="col" className="num">Per month</th>
                <th scope="col" className="num">Per year</th>
                <th scope="col" className="num">Of gross</th>
              </tr>
            </thead>
            <tbody>
              <tr className="salary-table__gross">
                <th scope="row">Gross pay</th>
                <td className="num"><Amount minorUnits={b.monthlyGrossMinor} size="sm" tone="neutral" /></td>
                <td className="num"><Amount minorUnits={b.annualGrossMinor} size="sm" tone="neutral" /></td>
                <td className="num">100%</td>
              </tr>
              {rows.map((r) => (
                <tr key={r.key}>
                  <th scope="row">
                    <span className={`salary-swatch salary-swatch--${r.tone}`} aria-hidden="true" /> {r.name}
                  </th>
                  <td className="num">− <Amount minorUnits={r.monthly} size="sm" tone="neutral" /></td>
                  <td className="num">− <Amount minorUnits={r.monthly * 12} size="sm" tone="neutral" /></td>
                  <td className="num">{pct(r.monthly, b.monthlyGrossMinor)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">
                  <span className="salary-swatch salary-swatch--net" aria-hidden="true" /> Take-home
                </th>
                <td className="num"><Amount minorUnits={b.monthlyNetMinor} size="sm" tone="neutral" /></td>
                <td className="num"><Amount minorUnits={b.annualNetMinor} size="sm" tone="neutral" /></td>
                <td className="num">{pct(b.monthlyNetMinor, b.monthlyGrossMinor)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
}
