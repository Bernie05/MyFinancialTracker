/**
 * The signed-in user for the current request, carried through async calls with AsyncLocalStorage.
 *
 * The auth guard (http.ts) runs each authenticated handler inside `runAsUser`; repositories read
 * `currentUserId()` for every query. Outside that (a forgotten guard, a background job), there is no
 * user and the call throws: queries fail closed rather than reading or writing everyone's data.
 * Scripts that act for a user (seeds, tests) wrap their work in `runAsUser` explicitly.
 */
import { AsyncLocalStorage } from "node:async_hooks";

const store = new AsyncLocalStorage<{ userId: number }>();

export function runAsUser<T>(userId: number, fn: () => T): T {
  return store.run({ userId }, fn);
}

export function currentUserId(): number {
  const ctx = store.getStore();
  if (!ctx) throw new Error("No signed-in user in context: refusing to run an unscoped query.");
  return ctx.userId;
}
