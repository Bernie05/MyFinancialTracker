import { useSyncExternalStore, type MouseEvent } from "react";

/**
 * History routing without a router library. The server already answers every non-API
 * path with index.html ("/*" in server/index.ts), so deep links and reloads work.
 */
const subscribe = (onChange: () => void) => {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
};

export const usePath = () => useSyncExternalStore(subscribe, () => window.location.pathname);
/** The query string ("?page=2"); a string snapshot so React only re-renders when it changes. */
export const useSearch = () => useSyncExternalStore(subscribe, () => window.location.search);

/** `replace` swaps the current history entry instead of adding one (used while typing in search). */
export function navigate(path: string, { replace = false } = {}) {
  if (path === window.location.pathname + window.location.search) return;
  history[replace ? "replaceState" : "pushState"](null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

/** onClick for a plain <a href>: client-side navigation, but keep ctrl/cmd/middle-click "open in new tab". */
export function linkClick(event: MouseEvent<HTMLAnchorElement>) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  navigate(event.currentTarget.pathname + event.currentTarget.search);
}
