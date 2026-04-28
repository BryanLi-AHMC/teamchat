import { Router } from "express";
import type { Request, Response } from "express";

import { supabaseAdmin } from "../lib/supabase";

type AuthenticatedRequest = Request & {
  currentProfile?: {
    id: string;
    email: string;
    display_name: string;
    role: string;
    is_active: boolean;
  };
};

async function resolveProfileFromRequest(req: Request, res: Response, next: () => void) {
  try {
    if (!supabaseAdmin) {
      res.status(500).json({ error: "Supabase admin is not configured." });
      return;
    }

    const authHeader = req.header("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

    if (!token) {
      const reason = "invalid_token";
      console.warn("[auth/profile] forbidden", { branch: reason, authEmail: null });
      res.status(403).json({
        error: "Your account is not authorized for this portal.",
        reason,
        authEmail: null,
      });
      return;
    }

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) {
      const reason = "invalid_token";
      console.warn("[auth/profile] forbidden", {
        branch: reason,
        authEmail: null,
        authError: error?.message ?? null,
      });
      res.status(403).json({
        error: "Your account is not authorized for this portal.",
        reason,
        authEmail: null,
      });
      return;
    }

    const authEmail = data.user.email?.trim() ?? "";
    if (!authEmail) {
      const reason = "missing_email";
      console.warn("[auth/profile] forbidden", { branch: reason, authEmail: null });
      res.status(403).json({
        error: "Your account is not authorized for this portal.",
        reason,
        authEmail: null,
      });
      return;
    }

    const normalizedEmail = authEmail.trim().toLowerCase();
    console.log("[auth/profile] email normalization", {
      authEmail,
      normalizedEmail,
    });

    const { data: profiles, error: profileLookupError } = await supabaseAdmin
      .from("internal_profiles")
      .select("id,email,display_name,role,is_active")
      .ilike("email", normalizedEmail)
      .limit(25);

    if (profileLookupError) {
      const reason = "stale_portal_check_failed";
      console.warn("[auth/profile] forbidden", {
        branch: reason,
        authEmail,
        normalizedEmail,
        profileLookupError: profileLookupError.message,
      });
      res.status(403).json({
        error: "Your account is not authorized for this portal.",
        reason,
        authEmail,
      });
      return;
    }

    const profileMatches = (profiles ?? []).filter((candidate) => {
      const candidateEmail = typeof candidate.email === "string" ? candidate.email.trim().toLowerCase() : "";
      return candidateEmail === normalizedEmail;
    });
    const profile = profileMatches[0];

    console.log("[auth/profile] profile lookup result", {
      authEmail,
      normalizedEmail,
      found: Boolean(profile),
      candidateCount: profileMatches.length,
      profileId: profile?.id ?? null,
      is_active: profile?.is_active ?? null,
      role: profile?.role ?? null,
    });

    if (!profile) {
      const reason = "profile_not_found";
      console.warn("[auth/profile] forbidden", { branch: reason, authEmail, normalizedEmail });
      res.status(403).json({
        error: "Your account is not authorized for this portal.",
        reason,
        authEmail,
      });
      return;
    }

    if (!profile.is_active) {
      const reason = "profile_inactive";
      console.warn("[auth/profile] forbidden", {
        branch: reason,
        authEmail,
        normalizedEmail,
        is_active: profile.is_active,
        role: profile.role,
      });
      res.status(403).json({
        error: "Your account is not authorized for this portal.",
        reason,
        authEmail,
      });
      return;
    }

    (req as AuthenticatedRequest).currentProfile = profile;
    next();
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unable to resolve current profile.",
    });
  }
}

export const authRouter = Router();

authRouter.get("/profile", resolveProfileFromRequest, (req, res) => {
  const currentProfile = (req as AuthenticatedRequest).currentProfile;
  if (!currentProfile) {
    res.status(401).json({ error: "Not authenticated." });
    return;
  }
  res.json({ data: currentProfile });
});
