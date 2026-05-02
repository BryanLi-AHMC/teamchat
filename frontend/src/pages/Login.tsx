import { type FormEvent, useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { requireActiveInternalProfileWithToken } from "../lib/authProfile";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import "./Login.css";

const isDev = import.meta.env.DEV;

function clearSupabaseAuthArtifacts() {
  if (typeof window === "undefined") {
    return;
  }

  const shouldClearKey = (key: string) => {
    const normalized = key.toLowerCase();
    return (
      normalized.includes("supabase") ||
      normalized.includes("sb-") ||
      normalized.includes("auth-token")
    );
  };

  for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
    const key = window.localStorage.key(index);
    if (key && shouldClearKey(key)) {
      window.localStorage.removeItem(key);
    }
  }

  for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
    const key = window.sessionStorage.key(index);
    if (key && shouldClearKey(key)) {
      window.sessionStorage.removeItem(key);
    }
  }

  const cookies = document.cookie ? document.cookie.split(";") : [];
  for (const cookie of cookies) {
    const [rawName] = cookie.split("=");
    const cookieName = rawName?.trim();
    if (cookieName && shouldClearKey(cookieName)) {
      document.cookie = `${cookieName}=; Max-Age=0; path=/`;
    }
  }
}

function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  useEffect(() => {
    let isMounted = true;
    const stateError =
      typeof location.state === "object" && location.state
        ? (location.state as { errorMessage?: string }).errorMessage
        : "";

    if (stateError) {
      setErrorMessage(stateError);
    }

    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!isMounted) {
        return;
      }
      setHasSession(Boolean(data.session));
    };

    checkSession();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");
    setIsLoading(true);

    if (!isSupabaseConfigured) {
      setIsLoading(false);
      setErrorMessage(
        "Login is unavailable because Supabase is not configured. Please check environment variables."
      );
      return;
    }

    try {
      const normalizedEmail = email.trim().toLowerCase();
      await supabase.auth.signOut();
      clearSupabaseAuthArtifacts();

      if (isDev) {
        console.log("[auth/login] enteredEmail", normalizedEmail);
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (error) {
        setErrorMessage(error.message || "Unable to login. Please try again.");
        return;
      }

      const signedInUserEmail = data.user?.email?.trim().toLowerCase() ?? "";
      if (isDev) {
        console.log("[auth/login] signedInUserEmail", signedInUserEmail || null);
      }
      if (!signedInUserEmail || signedInUserEmail !== normalizedEmail) {
        await supabase.auth.signOut();
        setErrorMessage(
          "Signed-in account does not match the email entered. Please retry with the correct account."
        );
        return;
      }

      const accessToken = data.session?.access_token;
      if (!accessToken) {
        await supabase.auth.signOut();
        setErrorMessage("Login succeeded but no valid session token was returned. Please try again.");
        return;
      }

      if (isDev) {
        console.log("[auth/login] token source", "fresh login response");
      }

      await requireActiveInternalProfileWithToken(accessToken);
      navigate("/", { replace: true });
    } catch (error) {
      console.error("Login failed", error);
      if (error instanceof Error) {
        setErrorMessage(error.message);
        return;
      }
      setErrorMessage(
        "Something went wrong while signing in. Please try again in a moment."
      );
    } finally {
      setIsLoading(false);
    }
  };

  if (hasSession === null) {
    return <div className="login-page">Checking session...</div>;
  }

  if (hasSession) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="login-page">
      <div className="login-gradient-backdrop" aria-hidden="true" />
      <div className="login-brand">
        <p className="login-brand-title">AIBuddy</p>
      </div>
      <div className="login-card-shell">
        <div className="login-card">
          <h2 className="login-title">Welcome back</h2>
          <form onSubmit={handleSubmit} className="login-form">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />

            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />

            <button type="submit" disabled={isLoading}>
              {isLoading ? "Signing in..." : "Login"}
            </button>

            <p className={`login-error${errorMessage ? " is-visible" : ""}`} role="alert">
              {errorMessage}
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}

export default Login;
