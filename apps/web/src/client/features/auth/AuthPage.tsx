import { Button, TextField } from "@mft/ui";
import logoMark from "@mft/ui/logo-mark.svg";
import { useEffect, useState, type FormEvent } from "react";
import { credentialsSchema } from "../../../shared/contracts";
import { ApiError } from "../../api/client";
import { api } from "../../api/endpoints";
import { linkClick, navigate } from "../../lib/router";
import { nextPath, signedIn } from "../../lib/session";

type Mode = "login" | "register";

/** The email typed on the register page, carried to the sign-in form (memory only, never stored). */
let rememberedEmail = "";
type FieldErrors = Partial<Record<"email" | "password", string>>;

const copy = {
  login: { title: "Sign in", subtitle: "Welcome back. Your money, where you left it.", button: "Sign in", other: "New here?", otherLink: "Create an account" },
  register: { title: "Create your account", subtitle: "Track spending, cards and installments in one place.", button: "Create account", other: "Have an account?", otherLink: "Sign in" },
} as const;

/** Sign in and register share one page: the same card, fields and error handling. */
export function AuthPage({ mode }: { mode: Mode }) {
  const [email, setEmail] = useState(mode === "login" ? rememberedEmail : "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const text = copy[mode];
  const params = new URLSearchParams(window.location.search);
  // Carry ?next= between sign in and register (never the "registered" flag).
  const nextParam = params.get("next");
  const keepNext = nextParam ? `?next=${encodeURIComponent(nextParam)}` : "";
  const justRegistered = mode === "login" && params.get("registered") === "1";

  useEffect(() => {
    document.title = `${text.title} · MyFinancialTracker`;
    setErrors({});
    setFormError(null);
  }, [mode, text.title]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const parsed = credentialsSchema.safeParse({ email, password });
    const next: FieldErrors = {};
    for (const issue of parsed.error?.issues ?? []) next[issue.path[0] as keyof FieldErrors] ??= issue.message;
    if (mode === "register" && password.length > 0 && password.length < 8) next.password = "Use at least 8 characters.";
    if (!parsed.success || Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      if (mode === "register") {
        // Register never signs in (it answers the same either way): go sign in, email filled in.
        await api.register(parsed.data);
        rememberedEmail = parsed.data.email;
        navigate(`/login?registered=1${nextParam ? `&next=${encodeURIComponent(nextParam)}` : ""}`, { replace: true });
        setBusy(false);
        return;
      }
      const { user } = await api.login(parsed.data);
      rememberedEmail = "";
      signedIn(user);
      navigate(nextPath(), { replace: true });
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length > 0) setErrors(err.fields as FieldErrors);
      else setFormError(err instanceof Error ? err.message : "Something went wrong. Try again.");
      setBusy(false);
    }
  }

  return (
    <main className="auth">
      <div className="auth__brand">
        <img src={logoMark} alt="" width={40} height={40} />
        <span>MyFinancialTracker</span>
      </div>
      <section className="auth__card" aria-labelledby="auth-title">
        <h1 id="auth-title" className="auth__title">
          {text.title}
        </h1>
        <p className="auth__subtitle">{text.subtitle}</p>
        {justRegistered && (
          <p className="auth__notice" role="status">
            If this email can be used, your account is ready. Sign in to continue.
          </p>
        )}
        <form className="auth__form" onSubmit={onSubmit} noValidate>
          <TextField
            label="Email"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={errors.email}
            autoFocus={!justRegistered}
          />
          <div className="auth__password">
            <TextField
              label="Password"
              type={showPassword ? "text" : "password"}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={errors.password}
              autoFocus={justRegistered}
              hint={mode === "register" ? "At least 8 characters. A short sentence works well." : undefined}
            />
            <button type="button" className="link-text auth__toggle" aria-pressed={showPassword} onClick={() => setShowPassword((s) => !s)}>
              {showPassword ? "Hide password" : "Show password"}
            </button>
          </div>
          {formError && (
            <p className="add-form__error" role="alert">
              {formError}
            </p>
          )}
          <Button type="submit" loading={busy} fullWidth>
            {text.button}
          </Button>
        </form>
        <p className="auth__switch">
          {text.other}{" "}
          <a href={`${mode === "login" ? "/register" : "/login"}${keepNext}`} onClick={linkClick}>
            {text.otherLink}
          </a>
        </p>
      </section>
    </main>
  );
}
