import { useCallback, useEffect, useRef, useState } from "react";

export type AsyncState<T> =
  | { status: "loading"; data?: T }
  | { status: "success"; data: T }
  | { status: "error"; error: Error; data?: T };

/**
 * Runs `load` whenever `deps` change and exposes the result as a discriminated union,
 * so a component handles loading, success and error explicitly. `reload()` refetches
 * after a mutation. Stale responses (an older month arriving late) are ignored, and the superseded request
 * is aborted (`load` gets the signal), so StrictMode's double effect leaves one request running.
 * While a refetch runs, `data` keeps the last result so the screen doesn't drop back to a skeleton.
 *
 * A data-fetching library such as TanStack Query does this and more (caching, retries);
 * this hook is the minimum the first feature needs.
 */
export function useAsync<T>(load: (signal: AbortSignal) => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<AsyncState<T>>({ status: "loading" });
  const requestId = useRef(0);
  const inFlight = useRef<AbortController | null>(null);

  const run = useCallback(load, deps);

  const reload = useCallback(() => {
    inFlight.current?.abort();
    const controller = (inFlight.current = new AbortController());
    const id = ++requestId.current;
    setState((prev) => ({ status: "loading", data: prev.data }));
    run(controller.signal).then(
      (data) => id === requestId.current && setState({ status: "success", data }),
      (error: Error) => id === requestId.current && setState((prev) => ({ status: "error", error, data: prev.data })),
    );
  }, [run]);

  useEffect(() => {
    reload();
    return () => inFlight.current?.abort();
  }, [reload]);

  return { state, reload };
}
