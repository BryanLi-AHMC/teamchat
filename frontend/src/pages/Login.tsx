import { type CSSProperties, type FormEvent, useEffect, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { requireActiveInternalProfile } from "../lib/authProfile";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import "./Login.css";

const petImages = [
  "/assets/pets/beaver.png",
  "/assets/pets/bee.png",
  "/assets/pets/bunny.png",
  "/assets/pets/cat.png",
  "/assets/pets/fox.png",
  "/assets/pets/dog.png",
  "/assets/pets/chick.png",
];

const PET_COUNT = 7;
const PET_SIZE = 56;
const ORBIT_GAP = 18;
const TOP_ORBIT_GAP = 18;
const PET_SPACING = 52;
const ORBIT_SPEED = 58;

function pointOnRoundedRectPerimeter(
  distance: number,
  width: number,
  height: number,
  offsets: { left: number; right: number; top: number; bottom: number }
) {
  const w = width + offsets.left + offsets.right;
  const h = height + offsets.top + offsets.bottom;
  const perimeter = 2 * (w + h);
  const d = ((distance % perimeter) + perimeter) % perimeter;

  const topHalf = w / 2;
  const leftSide = h;
  const bottom = w;
  const rightSide = h;

  let x = 0;
  let y = 0;

  if (d < topHalf) {
    x = w / 2 - d;
    y = 0;
  } else if (d < topHalf + leftSide) {
    x = 0;
    y = d - topHalf;
  } else if (d < topHalf + leftSide + bottom) {
    x = d - topHalf - leftSide;
    y = h;
  } else if (d < topHalf + leftSide + bottom + rightSide) {
    x = w;
    y = h - (d - topHalf - leftSide - bottom);
  } else {
    x = w - (d - topHalf - leftSide - bottom - rightSide);
    y = 0;
  }

  return {
    x: x - offsets.left,
    y: y - offsets.top,
  };
}

function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const shellRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const [petPositions, setPetPositions] = useState(
    petImages.slice(0, PET_COUNT).map(() => ({ x: 0, y: 0 }))
  );

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

  useEffect(() => {
    let animationFrameId = 0;
    let startTime = 0;

    const animate = (timestamp: number) => {
      if (startTime === 0) {
        startTime = timestamp;
      }

      const shell = shellRef.current;
      const card = cardRef.current;

      if (shell && card) {
        const shellRect = shell.getBoundingClientRect();
        const cardRect = card.getBoundingClientRect();
        const elapsedSeconds = (timestamp - startTime) / 1000;
        const baseDistance = elapsedSeconds * ORBIT_SPEED;
        const petSize =
          Number.parseFloat(
            window.getComputedStyle(shell).getPropertyValue("--pet-size")
          ) || PET_SIZE;
        const orbitGap =
          Number.parseFloat(
            window.getComputedStyle(shell).getPropertyValue("--orbit-gap")
          ) || ORBIT_GAP;
        const topOrbitGap =
          Number.parseFloat(
            window.getComputedStyle(shell).getPropertyValue("--top-orbit-gap")
          ) || TOP_ORBIT_GAP;
        const nextPositions = petImages.slice(0, PET_COUNT).map((_, index) => {
          const point = pointOnRoundedRectPerimeter(
            baseDistance + index * PET_SPACING,
            cardRect.width,
            cardRect.height,
            {
              left: orbitGap,
              right: orbitGap,
              top: topOrbitGap,
              bottom: orbitGap,
            }
          );

          const x = cardRect.left - shellRect.left + point.x - petSize / 2;
          const y = cardRect.top - shellRect.top + point.y - petSize / 2;

          return { x, y };
        });

        setPetPositions(nextPositions);
      }

      animationFrameId = window.requestAnimationFrame(animate);
    };

    animationFrameId = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
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
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (error) {
        setErrorMessage(error.message || "Unable to login. Please try again.");
        return;
      }

      console.log("[auth/login] sign-in success", {
        normalizedEmail,
        authUserId: data.user?.id ?? null,
        sessionCreated: Boolean(data.session),
      });

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
      <div className="login-gradient-backdrop" aria-hidden="true" />
      <div className="login-brand">
        <p className="login-brand-title">AIBuddy</p>
      </div>
      <div className="login-card-orbit-shell" ref={shellRef}>
        <div className="pets-orbit-layer" aria-hidden="true">
          {petImages.slice(0, PET_COUNT).map((src, index) => (
            <div
              className="pet-orbit-item"
              key={index}
              style={
                {
                  "--pet-x": `${petPositions[index]?.x ?? 0}px`,
                  "--pet-y": `${petPositions[index]?.y ?? 0}px`,
                } as CSSProperties
              }
            >
              <img src={src} alt="" draggable={false} />
            </div>
          ))}
        </div>
        <div className="login-card" ref={cardRef}>
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
