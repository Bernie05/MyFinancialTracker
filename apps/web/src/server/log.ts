/**
 * Auth event log (audit SEC-8): one JSON line per outcome, enough to spot credential stuffing,
 * lockouts and session misuse. Emails are logged only as a short SHA-256, so the log isn't a list of
 * accounts. Never pass passwords, tokens, cookies or password hashes here.
 */
export type AuthEvent =
  | "login_ok"
  | "login_fail"
  | "register"
  | "logout"
  | "password_change"
  | "password_change_fail"
  | "rate_limited";

export const emailTag = (email: string) => new Bun.CryptoHasher("sha256").update(email).digest("hex").slice(0, 16);

export function logAuth(evt: AuthEvent, fields: { ip: string; userId?: number; email?: string; detail?: string }) {
  const { email, ...rest } = fields;
  console.info(JSON.stringify({ ts: new Date().toISOString(), evt, ...rest, ...(email && { emailHash: emailTag(email) }) }));
}
