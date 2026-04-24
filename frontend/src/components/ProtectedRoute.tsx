import { PropsWithChildren, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { requireActiveInternalProfile } from "../lib/authProfile";
import { supabase } from "../lib/supabase";

function ProtectedRoute({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [authorizationFailed, setAuthorizationFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!isMounted) {
        return;
      }

      if (!data.session) {
        setSession(null);
        setIsAuthorized(false);
        setAuthorizationFailed(false);
        setLoading(false);
        return;
      }

      try {
        await requireActiveInternalProfile();
        if (!isMounted) {
          return;
        }
        setSession(data.session);
        setIsAuthorized(true);
        setAuthorizationFailed(false);
      } catch {
        if (!isMounted) {
          return;
        }
        setSession(null);
        setIsAuthorized(false);
        setAuthorizationFailed(true);
      }
      setLoading(false);
    };

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!nextSession) {
        setSession(null);
        setIsAuthorized(false);
        setAuthorizationFailed(false);
        setLoading(false);
        return;
      }

      void requireActiveInternalProfile()
        .then(() => {
          setSession(nextSession);
          setIsAuthorized(true);
          setAuthorizationFailed(false);
          setLoading(false);
        })
        .catch(() => {
          setSession(null);
          setIsAuthorized(false);
          setAuthorizationFailed(true);
          setLoading(false);
        });
    });

    return () => {
      isMounted = false;
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
