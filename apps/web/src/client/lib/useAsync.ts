import { useCallback, useEffect, useRef, useState } from "react";

export type AsyncState<T> =
  | { status: "loading"; data?: T }
  | { status: "success"; data: T }
  | { status: "error"; error: Error; data?: T };

/**
 * Runs `load` whenever `deps` change and exposes the result as a discriminated union,
 * so a component handles loading, success and error explicitly. `reload()` refetches
 * after a mutation. Stale responses (an older month arriving late) are ignored.
 *
 * A data-fetching library such as TanStack Query does this and more (caching, retries);
 * this hook is the minimum the first feature needs.
 */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<AsyncState<T>>({ status: "loading" });
  const requestId = useRef(0);

  const run = useCallback(load, deps);

  const reload = useCallback(() => {
    const id = ++requestId.current;
    setState((prev) => ({ status: "loading", data: prev.data }));
    run().then(
      (data) => id === requestId.current && setState({ status: "success", data }),
      (error: Error) => id === requestId.current && setState((prev) => ({ status: "error", error, data: prev.data })),
    );
  }, [run]);

  useEffect(reload, [reload]);

  return { state, reload };
}
