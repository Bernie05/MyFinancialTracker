import { Button, Card, TextField } from "@mft/ui";
import { useState, type FormEvent } from "react";
import { ApiError } from "../../api/client";
import { api } from "../../api/endpoints";
import { PageHeader } from "../../layout/PageHeader";
import { linkClick } from "../../lib/router";
import { useSession } from "../../lib/session";

type FieldErrors = Partial<Record<"currentPassword" | "newPassword", string>>;

/** Your account (email, password) and where the other settings live. */
export function SettingsPage() {
  const session = useSession();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    setFormError(null);
    const local: FieldErrors = {};
    if (!current) local.currentPassword = "Enter your current password.";
    if (next.length < 8) local.newPassword = "Use at least 8 characters.";
    if (Object.keys(local).length > 0) {
      setErrors(local);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await api.changePassword({ currentPassword: current, newPassword: next });
      setCurrent("");
      setNext("");
      setMessage("Password changed. You were signed out on your other devices.");
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length > 0) setErrors(err.fields as FieldErrors);
      else setFormError(err instanceof Error ? err.message : "Couldn't change the password. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <PageHeader title="Settings" />
      <div className="settings">
        <Card title="Account" subtitle="You sign in with this email.">
          <p className="settings__email">{session.status === "signed-in" ? session.user.email : "…"}</p>
        </Card>

        <Card title="Change password" subtitle="Your other devices are signed out when you change it.">
          <form className="add-form" onSubmit={onSubmit} noValidate>
            <TextField
              label="Current password"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              error={errors.currentPassword}
            />
            <TextField
              label="New password"
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              error={errors.newPassword}
              hint="At least 8 characters."
            />
            {formError && (
              <p className="add-form__error" role="alert">
                {formError}
              </p>
            )}
            {message && (
              <p className="settings__ok" role="status">
                {message}
              </p>
            )}
            <div>
              <Button type="submit" loading={busy}>
                Change password
              </Button>
            </div>
          </form>
        </Card>

        <Card title="Categories" subtitle="Names, colors and subcategories.">
          <a className="link-text" href="/categories" onClick={linkClick}>
            Manage categories
          </a>
        </Card>
      </div>
    </div>
  );
}
