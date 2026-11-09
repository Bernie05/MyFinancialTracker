/**
 * People (friends and family whose charges go on your cards), what they owe you, and their repayments.
 * Also the one check every split passes through before it's stored (`checkSplit`).
 */
import {
  idSchema,
  newPersonPaymentSchema,
  newPersonSchema,
  updatePersonSchema,
  type Card,
  type PersonBilling,
  type PersonPlan,
  type PersonShare,
  type PersonSummary,
  type SplitInput,
} from "../../shared/contracts";
import { dueDateFor, nextClose } from "../../shared/cardCycle";
import { installmentSchedule } from "../../shared/installments";
import { allocate, normalizeSplit, splitPeople, type Split } from "../../shared/split";
import { HttpError, json, readBody, route } from "../http";
import type { PersonTotals, Repositories } from "../repositories/types";
import { ensureInstallmentsSynced, todayLocal } from "./cards";

type WithId = Request & { params: { id: string } };

const formatMinor = (minor: number) => `₱${(minor / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Normalizes a split (all yours → null) and checks it: expenses only, every person is one of yours,
 * and exact amounts add up to the total. `keepIds`: people the item already had, allowed even if archived since.
 */
export async function checkSplit(
  repos: Repositories,
  input: SplitInput | null | undefined,
  { amountMinor, type, keepIds = [] }: { amountMinor: number; type: "expense" | "income"; keepIds?: number[] },
): Promise<Split | null> {
  const split = normalizeSplit(input);
  if (!split) return null;
  const bad = (message: string) => new HttpError(400, "Some fields need fixing.", { split: message });
  if (type !== "expense") throw bad("Only expenses can be split or assigned to someone.");
  for (const part of split.parts) {
    if (part.personId === null) continue;
    const person = await repos.people.findById(part.personId);
    if (!person) throw bad("Choose people from your list.");
    if (person.archived && !keepIds.includes(person.id)) throw bad(`${person.name} is archived. Unarchive them on the People page first.`);
  }
  if (split.mode === "amounts") {
    const sum = split.parts.reduce((a, p) => a + p.value, 0);
    if (sum !== amountMinor) throw bad(`The amounts add up to ${formatMinor(sum)}, but the total is ${formatMinor(amountMinor)}.`);
  }
  return split;
}

/**
 * Each person's part of every installment plan that names them: billed so far, still to come, and a
 * regular month. Worked out from the plan's schedule with the same split math as the stored months, so
 * "billed" here matches their stored shares to the centavo.
 */
async function plansByPerson(repos: Repositories) {
  await ensureInstallmentsSynced(repos);
  const today = todayLocal();
  const cards = new Map((await repos.cards.list()).map((c) => [c.id, c]));
  const out = new Map<number, PersonPlan[]>();
  const upcoming = new Map<number, BillingInput[]>();
  for (const plan of await repos.installments.listAll()) {
    const people = splitPeople(plan.split);
    const card = cards.get(plan.cardId);
    if (people.length === 0 || !card) continue;
    const s = installmentSchedule(plan, card.closingDay, today);
    for (const personId of people) {
      const partOf = (amountMinor: number) => allocate(amountMinor, plan.split).find((a) => a.personId === personId)?.amountMinor ?? 0;
      let billedMinor = 0;
      let upcomingMinor = 0;
      const items = upcoming.get(personId) ?? [];
      for (const entry of s.schedule) {
        const part = partOf(entry.amountMinor);
        if (entry.status === "billed") {
          billedMinor += part;
          continue;
        }
        upcomingMinor += part;
        // Same label as the month's expense will get once it's billed.
        const label = entry.kind === "fee" ? "processing fee" : entry.kind === "pretermination" ? "pre-termination" : `${entry.month}/${plan.months}`;
        items.push({
          key: `p${plan.id}-${entry.seq}`,
          monthKey: `p${plan.id}-${entry.seq}`,
          occurredOn: entry.billedOn,
          description: `${plan.description} (${label})`,
          totalMinor: entry.amountMinor,
          amountMinor: part,
          installmentId: plan.id,
          upcoming: true,
          cardId: card.id,
        });
      }
      upcoming.set(personId, items);
      const next = s.schedule.find((e) => e.status === "upcoming");
      const list = out.get(personId) ?? [];
      list.push({
        installmentId: plan.id,
        cardId: card.id,
        cardName: card.name,
        description: plan.description,
        months: plan.months,
        monthsBilled: s.monthsBilled,
        monthlyMinor: plan.preterminatedOn ? 0 : partOf(s.monthlyMinor),
        billedMinor,
        upcomingMinor,
        nextBilledOn: next?.billedOn ?? null,
        status: s.status,
      });
      out.set(personId, list);
    }
  }
  return { plans: out, upcoming };
}

/** A charge (or a future installment month) going into a billing; whether it's paid is worked out there. */
type BillingInput = Omit<PersonBilling["items"][number], "paid" | "paidMinor"> & { cardId: number | null };

const fromShare = (s: PersonShare): BillingInput => ({
  key: `t${s.transactionId}`,
  // The same key a month had before it was billed, so a repayment for that month still finds it.
  monthKey: s.installmentId !== null ? `p${s.installmentId}-${s.installmentSeq}` : `t${s.transactionId}`,
  occurredOn: s.occurredOn,
  description: s.description,
  totalMinor: s.totalMinor,
  amountMinor: s.amountMinor,
  installmentId: s.installmentId,
  upcoming: false,
  cardId: s.card?.id ?? null,
});

/** Last day of the month of `iso`: when a cash or debit charge is due. */
function endOfMonth(iso: string) {
  const [y, m] = iso.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m, 0));
  return `${y}-${String(m).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** The item a charge belongs to: its installment plan (`p<id>`), or the charge itself (`t<id>`). */
export const itemKeyOf = (item: { key: string; installmentId: number | null }) => (item.installmentId !== null ? `p${item.installmentId}` : item.key);

const oldestFirst = (a: { occurredOn: string; key: string }, b: { occurredOn: string; key: string }) =>
  a.occurredOn.localeCompare(b.occurredOn) || a.key.localeCompare(b.key);

/**
 * Groups a person's charges into billings (one card statement, or one month of cash/debit), then settles
 * them with their repayments: a repayment for an item covers that item's months oldest first, and the
 * rest (untargeted, or more than the item needed) covers billings oldest first. A billing still owing
 * after its due date is "unpaid", and what's left moves to the next billing, so "Paid" on a billing
 * always pays it plus anything before it.
 */
export function billingsFor(
  inputs: BillingInput[],
  cards: Map<number, Card>,
  payments: { amountMinor: number; itemKey: string | null }[],
  today: string,
): PersonBilling[] {
  const groups = new Map<string, Omit<PersonBilling, "paidMinor" | "remainingMinor" | "carriedInMinor" | "payMinor" | "status" | "movedTo">>();
  for (const { cardId, ...item } of inputs) {
    const card = cardId !== null ? cards.get(cardId) : undefined;
    const closeDate = card ? nextClose(item.occurredOn, card.closingDay) : null;
    const dueDate = card && closeDate ? dueDateFor(closeDate, card.dueDay) : endOfMonth(item.occurredOn);
    const key = `${card?.id ?? "cash"}|${dueDate}`;
    const group = groups.get(key) ?? { key, cardId: card?.id ?? null, cardName: card?.name ?? null, closeDate, dueDate, items: [], amountMinor: 0 };
    group.items.push({ ...item, paid: false, paidMinor: 0 });
    group.amountMinor += item.amountMinor;
    groups.set(key, group);
  }
  for (const g of groups.values()) g.items.sort((a, b) => b.occurredOn.localeCompare(a.occurredOn));
  const ordered = [...groups.values()].sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.key.localeCompare(b.key));
  const cover = (item: PersonBilling["items"][number], credit: number) => {
    const used = Math.min(credit, item.amountMinor - item.paidMinor);
    item.paidMinor += used;
    return used;
  };

  // A repayment for one month covers that month; more than it needed goes to the rest of its item.
  // A repayment for an item covers that item's months, oldest first.
  const byItem = new Map<string, PersonBilling["items"]>();
  const byMonth = new Map<string, PersonBilling["items"][number]>();
  for (const item of ordered.flatMap((g) => g.items)) {
    byItem.set(itemKeyOf(item), [...(byItem.get(itemKeyOf(item)) ?? []), item]);
    byMonth.set(item.monthKey, item);
  }
  let credit = 0;
  const targeted = new Map<string, number>();
  const toItem = (key: string, amount: number) => {
    if (byItem.has(key)) targeted.set(key, (targeted.get(key) ?? 0) + amount);
    else credit += amount;
  };
  for (const p of payments) {
    const month = p.itemKey ? byMonth.get(p.itemKey) : undefined;
    if (month && p.itemKey!.includes("-")) toItem(itemKeyOf(month), p.amountMinor - cover(month, p.amountMinor));
    else if (p.itemKey) toItem(p.itemKey.split("-")[0]!, p.amountMinor);
    else credit += p.amountMinor;
  }
  for (const [key, amount] of targeted) {
    let left = amount;
    for (const item of byItem.get(key)!.sort(oldestFirst)) left -= cover(item, left);
    credit += left; // more than the item needed
  }

  let owedBefore = 0; // unpaid from earlier billings
  let pastDueBefore = 0; // of that, from billings whose due date has passed
  const out: PersonBilling[] = ordered.map((g) => {
    // The rest settles billings oldest first, and within a billing its oldest charges first.
    for (const item of [...g.items].sort(oldestFirst)) credit -= cover(item, credit);
    for (const item of g.items) item.paid = item.paidMinor >= item.amountMinor;
    const paidMinor = g.items.reduce((sum, i) => sum + i.paidMinor, 0);
    const remainingMinor = g.amountMinor - paidMinor;
    const pastDue = g.dueDate < today;
    const billing: PersonBilling = {
      ...g,
      paidMinor,
      remainingMinor,
      carriedInMinor: pastDue ? 0 : pastDueBefore,
      payMinor: owedBefore + remainingMinor,
      status: remainingMinor === 0 ? "paid" : pastDue ? "unpaid" : paidMinor > 0 ? "partial" : "due",
      movedTo: null,
    };
    owedBefore += remainingMinor;
    if (pastDue) pastDueBefore += remainingMinor;
    else pastDueBefore = 0; // carried once, into the first billing that isn't past due
    return billing;
  });
  // An unpaid past-due billing points at the billing its amount moved to.
  const firstOpen = out.find((b) => b.dueDate >= today && b.remainingMinor > 0) ?? out.find((b) => b.dueDate >= today);
  for (const b of out) if (b.status === "unpaid" && firstOpen) b.movedTo = firstOpen.dueDate;
  return out;
}

/** Stored totals plus the installment months still to come and what's overdue. */
function summarize(person: PersonTotals, plans: PersonPlan[] = [], billings: PersonBilling[] = []): PersonSummary {
  const active = plans.filter((p) => p.status === "active");
  const upcomingMinor = active.reduce((sum, p) => sum + p.upcomingMinor, 0);
  const next = billings.find((b) => b.status === "due" || b.status === "partial");
  return {
    ...person,
    upcomingMinor,
    monthlyMinor: active.reduce((sum, p) => sum + p.monthlyMinor, 0),
    toPayOffMinor: person.balanceMinor + upcomingMinor,
    activePlans: active.length,
    overdueMinor: billings.filter((b) => b.status === "unpaid").reduce((sum, b) => sum + b.remainingMinor, 0),
    nextDue: next ? { dueDate: next.dueDate, amountMinor: next.remainingMinor + next.carriedInMinor } : null,
  };
}

export function createPeopleRoutes(repos: Repositories) {
  async function findPerson(rawId: string) {
    const person = await repos.people.findById(idSchema.parse(rawId));
    if (!person) throw new HttpError(404, "That person doesn't exist anymore.");
    return person;
  }

  async function assertNameFree(name: string, exceptId?: number) {
    const clash = await repos.people.findByName(name);
    if (clash && clash.id !== exceptId) throw new HttpError(409, "Some fields need fixing.", { name: `You already have someone called ${clash.name}.` });
  }

  /** A person's billings, oldest first: billed charges plus installment months still to come. */
  async function billingsOf(person: PersonTotals, cards: Map<number, Card>, upcoming: BillingInput[] = []) {
    const [shares, payments] = await Promise.all([repos.people.shares(person.id), repos.people.payments(person.id)]);
    return billingsFor([...shares.map(fromShare), ...upcoming], cards, payments, todayLocal());
  }
  const cardMap = async () => new Map((await repos.cards.list()).map((c) => [c.id, c]));

  return {
    "/api/people": {
      GET: route(async () => {
        const { plans, upcoming } = await plansByPerson(repos);
        const cards = await cardMap();
        const people = await repos.people.list();
        return json(await Promise.all(people.map(async (p) => summarize(p, plans.get(p.id), await billingsOf(p, cards, upcoming.get(p.id))))));
      }),
      POST: route(async (req) => {
        const { name } = await readBody(req, newPersonSchema);
        await assertNameFree(name);
        return json(summarize(await repos.people.create(name)), 201);
      }),
    },

    "/api/people/:id": {
      // The person, what they owe, every charge they have a part of, and their repayments.
      GET: route(async (req: WithId) => {
        const person = await findPerson(req.params.id);
        const all = await plansByPerson(repos);
        const plans = all.plans.get(person.id) ?? [];
        const [shares, payments] = await Promise.all([repos.people.shares(person.id), repos.people.payments(person.id)]);
        const billings = billingsFor([...shares.map(fromShare), ...(all.upcoming.get(person.id) ?? [])], await cardMap(), payments, todayLocal());
        // Active plans first, then by what's left.
        plans.sort((a, b) => (a.status === b.status ? b.upcomingMinor - a.upcomingMinor : a.status === "active" ? -1 : 1));
        return json({ ...summarize(person, plans, billings), shares, payments, plans, billings });
      }),
      PATCH: route(async (req: WithId) => {
        const person = await findPerson(req.params.id);
        const input = await readBody(req, updatePersonSchema);
        if (input.name !== undefined) await assertNameFree(input.name, person.id);
        const { plans, upcoming } = await plansByPerson(repos);
        const updated = await repos.people.update(person.id, input);
        return json(summarize(updated, plans.get(person.id), await billingsOf(updated, await cardMap(), upcoming.get(person.id))));
      }),
      // History matters: someone with charges or repayments is archived, not deleted.
      DELETE: route(async (req: WithId) => {
        const person = await findPerson(req.params.id);
        const payments = await repos.people.payments(person.id);
        if (person.shareCount > 0 || payments.length > 0) {
          throw new HttpError(409, `${person.name} has charges or repayments. Archive them instead, so the history stays.`);
        }
        await repos.people.remove(person.id);
        return new Response(null, { status: 204 });
      }),
    },

    "/api/people/:id/payments": {
      POST: route(async (req: WithId) => {
        const person = await findPerson(req.params.id);
        const input = await readBody(req, newPersonPaymentSchema);
        if (input.itemKey) {
          // Only an item this person has a part of: one of their charges, or a plan that names them.
          const shares = await repos.people.shares(person.id);
          const plans = (await plansByPerson(repos)).plans.get(person.id) ?? [];
          const theirs = new Set([...shares.map((s) => itemKeyOf(fromShare(s))), ...plans.map((p) => `p${p.installmentId}`)]);
          if (!theirs.has(input.itemKey.split("-")[0]!)) throw new HttpError(400, "Some fields need fixing.", { itemKey: `That isn't one of ${person.name}'s items.` });
        }
        return json(await repos.people.addPayment(person.id, input), 201);
      }),
    },

    "/api/people/:id/payments/:paymentId": {
      DELETE: route(async (req: Request & { params: { id: string; paymentId: string } }) => {
        const person = await findPerson(req.params.id);
        const removed = await repos.people.removePayment(person.id, idSchema.parse(req.params.paymentId));
        if (!removed) throw new HttpError(404, "That repayment doesn't exist anymore.");
        return new Response(null, { status: 204 });
      }),
    },
  };
}
