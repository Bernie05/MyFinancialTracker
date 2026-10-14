/**
 * API routes. Each handler: validate input → call a repository → return JSON.
 * Business rules that span tables (e.g. "category type must match transaction type")
 * live here, where both repositories are in reach.
 */
import { idSchema, newTransactionSchema, transactionListQuerySchema } from "../../shared/contracts";
import { HttpError, json, readBody, readQuery, route } from "../http";
import type { Repositories } from "../repositories/types";

export function createApiRoutes(repos: Repositories) {
  return {
    "/api/health": {
      GET: route(() => json({ ok: true })),
    },

    "/api/categories": {
      GET: route(async () => json(await repos.categories.list())),
    },

    "/api/transactions": {
      GET: route(async (req) => {
        const { month } = readQuery(req, transactionListQuerySchema);
        return json(await repos.transactions.listByMonth(month));
      }),

      POST: route(async (req) => {
        const input = await readBody(req, newTransactionSchema);
        const category = await repos.categories.findById(input.categoryId);
        if (!category) {
          throw new HttpError(400, "Some fields need fixing.", { categoryId: "Choose a category." });
        }
        if (category.type !== input.type) {
          throw new HttpError(400, "Some fields need fixing.", {
            categoryId: `${category.name} is an ${category.type} category.`,
          });
        }
        return json(await repos.transactions.create(input), 201);
      }),
    },

    "/api/transactions/:id": {
      DELETE: route(async (req: Request & { params: { id: string } }) => {
        const id = idSchema.parse(req.params.id);
        const removed = await repos.transactions.remove(id);
        if (!removed) throw new HttpError(404, "That transaction doesn't exist anymore.");
        return new Response(null, { status: 204 });
      }),
    },

    "/api/summary": {
      GET: route(async (req) => {
        const { month } = readQuery(req, transactionListQuerySchema);
        return json(await repos.summary.forMonth(month));
      }),
    },
  };
}
