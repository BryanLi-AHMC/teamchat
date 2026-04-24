import { FormEvent, useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { requireActiveInternalProfile } from "../lib/authProfile";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import "./Login.css";

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
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setErrorMessage(error.message || "Unable to login. Please try again.");
        return;
      }

      await requireActiveInternalProfile();
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
      <div className="login-card">
        <h1>TeamChat Login</h1>
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

          <p className="login-error" role="alert">
            {errorMessage}
          </p>
        </form>
      </div>
    </div>
  );
}

export default Login;
