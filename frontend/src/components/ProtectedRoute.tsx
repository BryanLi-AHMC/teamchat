import { PropsWithChildren, useEffect, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { requireActiveInternalProfile } from "../lib/authProfile";
import { supabase } from "../lib/supabase";

function ProtectedRoute({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [authorizationFailed, setAuthorizationFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const hasHandledFailure = useRef(false);
  const hasSignedOutAfterFailure = useRef(false);
  const isCheckingProfile = useRef(false);
  const isMounted = useRef(true);
  /** Mirrors latest session / auth for async auth callbacks (tab refocus refresh must not flash loading). */
  const sessionRef = useRef<Session | null>(null);
  const isAuthorizedRef = useRef(false);
  sessionRef.current = session;
  isAuthorizedRef.current = isAuthorized;

  useEffect(() => {
    isMounted.current = true;

    const applySignedOutState = () => {
      if (!isMounted.current) {
        return;
      }
      setSession(null);
      setIsAuthorized(false);
      setLoading(false);
    };

    const handleProfileFailure = async () => {
      if (!isMounted.current) {
        return;
      }
      if (!hasHandledFailure.current) {
        hasHandledFailure.current = true;
        setAuthorizationFailed(true);
      }
      applySignedOutState();
      if (!hasSignedOutAfterFailure.current) {
        hasSignedOutAfterFailure.current = true;
        await supabase.auth.signOut();
      }
    };

    const validateSession = async (
      candidateSession: Session | null,
      options?: { background?: boolean }
    ) => {
      if (!candidateSession) {
        hasHandledFailure.current = false;
        hasSignedOutAfterFailure.current = false;
        setAuthorizationFailed(false);
        applySignedOutState();
        return;
      }

      if (isCheckingProfile.current) {
        return;
      }

      isCheckingProfile.current = true;
      // Tab refocus often triggers token refresh / auth events. Do not show the full-route loader
      // when we are already in the portal for the same user — that unmounts the tree and feels like a reload.
      const sameUserAlreadyIn =
        isAuthorizedRef.current &&
        Boolean(candidateSession?.user?.id) &&
        candidateSession.user.id === sessionRef.current?.user?.id;
      if (isMounted.current && !options?.background && !sameUserAlreadyIn) {
        setLoading(true);
      }

      try {
        await requireActiveInternalProfile();
        if (!isMounted.current) {
          return;
        }
        hasHandledFailure.current = false;
        hasSignedOutAfterFailure.current = false;
        setSession(candidateSession);
        setIsAuthorized(true);
        setAuthorizationFailed(false);
      } catch {
        await handleProfileFailure();
      } finally {
        isCheckingProfile.current = false;
        if (isMounted.current) {
          setLoading(false);
        }
      }
    };

    const loadSession = async () => {
      const { data } = await supabase.auth.getSession();
      await validateSession(data.session);
    };

    void loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, nextSession) => {
      const background = event === "TOKEN_REFRESHED";
      void validateSession(nextSession, { background });
    });

    return () => {
      isMounted.current = false;
      subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return <div className="route-loading">Checking session...</div>;
  }

  if (!session || !isAuthorized) {
    return (
      <Navigate
        to="/login"
        replace
        state={
          authorizationFailed
            ? { errorMessage: "Your account is not authorized for this portal." }
            : undefined
        }
      />
    );
  }

  return <>{children}</>;
}

export default ProtectedRoute;
