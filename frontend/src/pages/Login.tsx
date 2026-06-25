import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { useT } from "../i18n";
import { ApiError } from "../api";

export default function Login() {
  const { login } = useAuth();
  const { t, locale, setLocale } = useT();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      nav("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("login.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <div className="login-card">
        <h1 className="login-brand">Karidasu</h1>
        <p className="login-sub">{t("login.subtitle")}</p>
        <form onSubmit={submit}>
          <label>
            {t("login.email")}
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label>
            {t("login.password")}
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={busy}>
            {busy ? t("login.loggingIn") : t("login.login")}
          </button>
        </form>
        <button className="lang-toggle" onClick={() => setLocale(locale === "ja" ? "en" : "ja")}>
          {locale === "ja" ? "English" : "日本語"}
        </button>
      </div>
    </div>
  );
}
