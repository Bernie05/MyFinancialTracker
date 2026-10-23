import { useSyncExternalStore } from "react";
import type { User } from "../../shared/contracts";
import { ApiError, setUnauthorizedHandler } from "../api/client";
import { api } from "../api/endpoints";
import { clearAlerts } from "./alerts";
import { navigate } from "./router";

/**
 * Who is signed in, shared by the whole app. "unknown" until /api/auth/me answers.
 * The session itself is an HttpOnly cookie the page can't read; this only mirrors who it belongs to.
 */
type SessionState = { status: "unknown" } | { status: "signed-out" } | { status: "signed-in"; user: User };

let state: SessionState = { status: "unknown" };
const listeners = new Set<() => void>();
const set = (next: SessionState) => {
  if (next.status !== "signed-in") clearAlerts();
  state = next;
  listeners.forEach((l) => l());
};

export const useSession = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );

export async function loadSession() {
  try {
    const { user } = await api.me();
    set({ status: "signed-in", user });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) set({ status: "signed-out" });
    else set({ status: "signed-out" }); // server unreachable: the login page explains what to try
  }
}

export const signedIn = (user: User) => set({ status: "signed-in", user });

/** Sends you to /login, remembering where you were (only same-site paths are ever followed back). */
export function goToLogin() {
  const here = window.location.pathname + window.location.search;
  set({ status: "signed-out" });
  if (!["/login", "/register"].includes(window.location.pathname)) {
    navigate(here === "/" ? "/login" : `/login?next=${encodeURIComponent(here)}`, { replace: true });
  }
}

export async function signOut() {
  try {
    await api.logout();
  } finally {
    set({ status: "signed-out" });
    navigate("/login", { replace: true });
  }
}

/** The `next` path from the URL, if it's a safe same-site path; otherwise the Dashboard. */
export function nextPath(search = window.location.search, origin = window.location.origin) {
  return safeNext(new URLSearchParams(search).get("next"), origin);
}

/**
 * Only a same-site path: it must start with a single "/", contain no backslash (browsers read "/\evil.com"
 * as "//evil.com"), and still resolve to this origin. Anything else goes to the Dashboard.
 */
export function safeNext(next: string | null, origin: string) {
  if (!next || !/^\/(?![/\\])/.test(next) || next.includes("\\") || /[\u0000-\u001f]/.test(next)) return "/";
  try {
    if (new URL(next, origin).origin !== origin) return "/";
  } catch {
    return "/";
  }
  return next.startsWith("/login") || next.startsWith("/register") ? "/" : next;
}

// A request that hits 401 mid-session (expired, signed out elsewhere) lands on the login page.
setUnauthorizedHandler(goToLogin);
