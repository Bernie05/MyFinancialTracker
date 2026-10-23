/**
 * Credit card routes: cards, their payments, per-card summaries and due-date alerts.
 * The statement math lives in shared/cardCycle.ts and the installment math in shared/installments.ts;
 * this file only gathers the sums they need.
 */
import { cardStatus, cycleDates } from "../../shared/cardCycle";
import { defaultFirstBillingMonth, installmentSchedule } from "../../shared/installments";
import {
  colorOwner,
  idSchema,
  newCardPaymentSchema,
  newCardSchema,
  newInstallmentSchema,
  updateCardSchema,
  updateInstallmentSchema,
  type Card,
  type CardAlert,
  type CardSummary,
  type InstallmentDetail,
} from "../../shared/contracts";
import { currentUserId } from "../context";
import { HttpError, json, readBody, route } from "../http";
import type { InstallmentRow, Repositories } from "../repositories/types";

type WithId = Request & { params: { id: string } };

/** Today as a local calendar date (the server and the user share a machine here). */
export function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const syncedOn = new Map<number, string>(); // per user: the day their plans were last synced
/**
 * Billed installment months are generated as expenses. Each read that depends on them calls this; it only
 * does work once per day (a new statement may have closed). Writes to plans regenerate directly.
 */
export async function ensureInstallmentsSynced(repos: Repositories) {
  const today = todayLocal();
  const userId = currentUserId();
  if (syncedOn.get(userId) === today) return;
  await repos.installments.sync(today);
  syncedOn.set(userId, today);
}

/** A stored plan plus everything derived from its schedule. */
function describe(row: InstallmentRow, closingDay: number, today: string): InstallmentDetail {
  const { schedule, ...derived } = installmentSchedule(row, closingDay, today);
  return { ...row, ...derived, schedule };
}

export function createCardRoutes(repos: Repositories) {
  async function findCard(rawId: string) {
    const card = await repos.cards.findById(idSchema.parse(rawId));
    if (!card) throw new HttpError(404, "That card doesn't exist anymore.");
    return card;
  }

  async function summarize(card: Card): Promise<CardSummary> {
    await ensureInstallmentsSynced(repos);
    const today = todayLocal();
    const dates = cycleDates(today, card.closingDay);
    const { transactionCount, ...totals } = await repos.cards.totals(card.id, { ...dates, today });
    const active = (await repos.installments.listForCard(card.id))
      .map((row) => describe(row, card.closingDay, today))
      .filter((p) => p.status === "active");
    const summary = cardStatus({
      ...card,
      ...totals,
      today,
      unbilledInstallmentPrincipalMinor: active.reduce((sum, p) => sum + p.unbilledPrincipalMinor, 0),
    });
    return {
      ...card,
      transactionCount,
      summary: {
        ...summary,
        installmentMonthlyTotalMinor: active.reduce((sum, p) => sum + (p.preterminatedOn ? 0 : p.monthlyMinor), 0),
        installmentRemainingMinor: active.reduce((sum, p) => sum + p.remainingMinor, 0),
        activeInstallments: active.length,
      },
    };
  }

  async function findInstallment(rawId: string) {
    const row = await repos.installments.findById(idSchema.parse(rawId));
    if (!row) throw new HttpError(404, "That installment doesn't exist anymore.");
    const card = (await repos.cards.findById(row.cardId))!;
    return { row, card };
  }

  async function assertExpenseCategory(categoryId: number) {
    const category = await repos.categories.findById(categoryId);
    if (!category || category.type !== "expense") {
      throw new HttpError(400, "Some fields need fixing.", { categoryId: "Choose an expense category." });
    }
  }

  /** Names are unique; colors are unique among cards (compared by how they look, like categories). */
  async function assertFree(data: { name?: string; color?: string }, exceptId?: number) {
    const all = await repos.cards.list();
    const fields: Record<string, string> = {};
    if (data.name !== undefined && all.some((c) => c.id !== exceptId && c.name === data.name)) {
      fields.name = `You already have a card called ${data.name}.`;
    }
    const owner = data.color !== undefined ? colorOwner(all, data.color, exceptId) : undefined;
    if (owner) fields.color = `${owner.name} already uses this color. Pick another.`;
    if (Object.keys(fields).length > 0) throw new HttpError(409, "Some fields need fixing.", fields);
  }

  return {
    "/api/cards": {
      GET: route(async () => json(await Promise.all((await repos.cards.list()).map(summarize)))),

      POST: route(async (req) => {
        const input = await readBody(req, newCardSchema);
        await assertFree(input);
        return json(await summarize(await repos.cards.create(input)), 201);
      }),
    },

    "/api/cards/:id": {
      GET: route(async (req: WithId) => json(await summarize(await findCard(req.params.id)))),

      PATCH: route(async (req: WithId) => {
        const card = await findCard(req.params.id);
        const input = await readBody(req, updateCardSchema);
        await assertFree(input, card.id);
        const updated = await repos.cards.update(card.id, input);
        // A new closing day moves every installment month to a different statement: rebuild them.
        if (input.closingDay !== undefined && input.closingDay !== card.closingDay) {
          const plans = await repos.installments.listForCard(card.id);
          await repos.installments.regenerate(plans.map((p) => p.id), todayLocal());
        }
        return json(await summarize(updated));
      }),

      // History matters: a card that has charges is archived, not deleted.
      DELETE: route(async (req: WithId) => {
        const card = await findCard(req.params.id);
        const { transactionCount } = await summarize(card);
        if (transactionCount > 0) {
          throw new HttpError(
            409,
            `${card.name} has ${transactionCount} transaction${transactionCount === 1 ? "" : "s"}. Archive it instead, so its history stays.`,
          );
        }
        await repos.cards.remove(card.id);
        return new Response(null, { status: 204 });
      }),
    },

    "/api/cards/:id/installments": {
      GET: route(async (req: WithId) => {
        const card = await findCard(req.params.id);
        await ensureInstallmentsSynced(repos);
        const today = todayLocal();
        return json((await repos.installments.listForCard(card.id)).map((row) => describe(row, card.closingDay, today)));
      }),

      POST: route(async (req: WithId) => {
        const card = await findCard(req.params.id);
        if (card.archived) throw new HttpError(409, `${card.name} is archived. Unarchive it to add installments.`);
        const input = await readBody(req, newInstallmentSchema);
        await assertExpenseCategory(input.categoryId);
        const id = await repos.installments.create(card.id, {
          ...input,
          firstBillingMonth: input.firstBillingMonth ?? defaultFirstBillingMonth(input.purchasedOn, card.closingDay),
        });
        const today = todayLocal();
        await repos.installments.regenerate([id], today);
        return json(describe((await repos.installments.findById(id))!, card.closingDay, today), 201);
      }),
    },

    "/api/installments/:id": {
      GET: route(async (req: WithId) => {
        const { row, card } = await findInstallment(req.params.id);
        await ensureInstallmentsSynced(repos);
        return json(describe(row, card.closingDay, todayLocal()));
      }),

      // Editing the terms (or pre-terminating: preterminatedOn) rebuilds the plan's billed expenses.
      PATCH: route(async (req: WithId) => {
        const { row, card } = await findInstallment(req.params.id);
        const input = await readBody(req, updateInstallmentSchema);
        if (input.categoryId !== undefined) await assertExpenseCategory(input.categoryId);
        const purchasedOn = input.purchasedOn ?? row.purchasedOn;
        const firstBillingMonth = input.firstBillingMonth ?? row.firstBillingMonth;
        const preterminatedOn = input.preterminatedOn === undefined ? row.preterminatedOn : input.preterminatedOn;
        if (firstBillingMonth < purchasedOn.slice(0, 7)) {
          throw new HttpError(400, "Some fields need fixing.", { firstBillingMonth: "Billing can't start before the purchase month." });
        }
        if (preterminatedOn && preterminatedOn < purchasedOn) {
          throw new HttpError(400, "Some fields need fixing.", { preterminatedOn: "Pre-termination can't be before the purchase." });
        }
        await repos.installments.update(row.id, input);
        const today = todayLocal();
        await repos.installments.regenerate([row.id], today);
        return json(describe((await repos.installments.findById(row.id))!, card.closingDay, today));
      }),

      // Removes the plan and every expense it generated, as if it was never entered.
      DELETE: route(async (req: WithId) => {
        const { row } = await findInstallment(req.params.id);
        await repos.installments.remove(row.id);
        return new Response(null, { status: 204 });
      }),
    },

    "/api/cards/:id/payments": {
      GET: route(async (req: WithId) => json(await repos.cards.payments((await findCard(req.params.id)).id))),

      // A payment settles the card; it is not an expense (the charges already were).
      POST: route(async (req: WithId) => {
        const card = await findCard(req.params.id);
        const input = await readBody(req, newCardPaymentSchema);
        return json(await repos.cards.addPayment(card.id, input), 201);
      }),
    },

    "/api/cards/:id/payments/:paymentId": {
      DELETE: route(async (req: Request & { params: { id: string; paymentId: string } }) => {
        const card = await findCard(req.params.id);
        const removed = await repos.cards.removePayment(card.id, idSchema.parse(req.params.paymentId));
        if (!removed) throw new HttpError(404, "That payment doesn't exist anymore.");
        return new Response(null, { status: 204 });
      }),
    },

    // Active cards that are due soon (inside their own notify window) or overdue, most urgent first.
    "/api/alerts": {
      GET: route(async () => {
        const cards = (await repos.cards.list()).filter((c) => !c.archived);
        const alerts: CardAlert[] = [];
        for (const card of await Promise.all(cards.map(summarize))) {
          const { status, dueDate, daysUntilDue, remainingDueMinor } = card.summary;
          if (status === "due_soon" || status === "overdue") {
            alerts.push({ cardId: card.id, name: card.name, last4: card.last4, color: card.color, dueDate, daysUntilDue, remainingDueMinor, status });
          }
        }
        return json(alerts.sort((a, b) => a.daysUntilDue - b.daysUntilDue));
      }),
    },
  };
}
