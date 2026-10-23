/**
 * The categories every account starts with. Used when someone registers and by `bun run db:seed`.
 */
import { categoryColorPresets, colorOwner, type CategoryColorPreset } from "../../shared/contracts";
import type { Repositories } from "../repositories/types";
import type { TransactionType } from "./schema";

export const defaultCategories: { name: string; type: TransactionType; color: CategoryColorPreset }[] = [
  { name: "Groceries", type: "expense", color: "green" },
  { name: "Bills & utilities", type: "expense", color: "red" },
  { name: "Transport", type: "expense", color: "blue" },
  { name: "Dining out", type: "expense", color: "orange" },
  { name: "Shopping", type: "expense", color: "purple" },
  { name: "Health", type: "expense", color: "pink" },
  { name: "Salary", type: "income", color: "teal" },
  { name: "Freelance", type: "income", color: "indigo" },
  { name: "Other income", type: "income", color: "amber" },
];

/**
 * Adds any default category the current user (see context.ts) doesn't have yet. Existing categories
 * keep their colors; a missing default whose color is taken gets the next free preset, so it never
 * trips the per-user unique color index. Returns how many were added.
 */
export async function ensureDefaultCategories(repos: Repositories) {
  const parents = (await repos.categories.list()).filter((c) => c.parentId === null);
  let added = 0;
  for (const d of defaultCategories) {
    if (parents.some((p) => p.name === d.name && p.type === d.type)) continue;
    const color = !colorOwner(parents, d.color) ? d.color : categoryColorPresets.find((k) => !colorOwner(parents, k));
    if (!color) continue; // every preset taken: skip rather than fail
    parents.push(await repos.categories.create({ name: d.name, type: d.type, color, parentId: null }));
    added += 1;
  }
  return added;
}
