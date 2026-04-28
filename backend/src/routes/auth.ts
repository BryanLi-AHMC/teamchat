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
    xp_total: number;
    points: number;
    level: number;
    streak: number;
  };
};

const normalizeEmail = (email: string | null | undefined): string => email?.trim().toLowerCase() ?? "";

const selectInternalProfileFields =
  "id,email,display_name,role,is_active,xp_total,points,level,streak";

async function resolveProfileFromRequest(req: Request, res: Response, next: () => void) {
  try {
    if (!supabaseAdmin) {
      res.status(500).json({ error: "Supabase admin is not configured." });
      return;
    }

    const authHeader = req.header("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    const hasCookieHeader = Boolean(req.header("cookie"));
    const forwardedProto = req.header("x-forwarded-proto") ?? null;

    if (!token) {
      const reason = "missing_session";
      console.warn("[auth/profile] forbidden", {
        branch: reason,
        authEmail: null,
        authUserId: null,
        queryCount: 0,
        activeFlags: [],
        hasCookieHeader,
        forwardedProto,
      });
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
        authUserId: null,
        authError: error?.message ?? null,
        queryCount: 0,
        activeFlags: [],
        hasCookieHeader,
        forwardedProto,
      });
      res.status(403).json({
        error: "Your account is not authorized for this portal.",
        reason,
        authEmail: null,
      });
      return;
    }

    const authUserId = data.user.id;
    const authEmail = data.user.email?.trim() ?? "";
    const normalizedEmail = normalizeEmail(authEmail);

    console.log("[auth/login] token validated", {
      normalizedEmail: normalizedEmail || null,
      authUserId: authUserId ?? null,
      tokenProvided: Boolean(token),
      cookiePresent: hasCookieHeader,
      forwardedProto,
    });

    if (!normalizedEmail) {
      const reason = "missing_email";
      console.warn("[auth/profile] forbidden", {
        branch: reason,
        authEmail: null,
        authUserId: authUserId ?? null,
        queryCount: 0,
        activeFlags: [],
      });
      res.status(403).json({
        error: "Your account is not authorized for this portal.",
        reason,
        authEmail: null,
      });
      return;
    }

    console.log("[auth/profile] email normalization", {
      authEmail,
      normalizedEmail,
    });

    const { data: profileById, error: profileByIdError } = await supabaseAdmin
      .from("internal_profiles")
      .select(selectInternalProfileFields)
      .eq("id", authUserId)
      .maybeSingle();

    if (profileByIdError) {
      const reason = "profile_lookup_failed";
      console.warn("[auth/profile] forbidden", {
        branch: reason,
        authEmail,
        authUserId,
        normalizedEmail,
        profileLookupError: profileByIdError.message,
      });
      res.status(403).json({
        error: "Your account is not authorized for this portal.",
        reason,
        authEmail,
      });
      return;
    }

    const { data: profilesByEmail, error: profileByEmailError } = await supabaseAdmin
      .from("internal_profiles")
      .select(selectInternalProfileFields)
      .eq("email", normalizedEmail)
      .limit(25);

    if (profileByEmailError) {
      const reason = "stale_portal_check_failed";
      console.warn("[auth/profile] forbidden", {
        branch: reason,
        authEmail,
        authUserId,
        normalizedEmail,
        profileLookupError: profileByEmailError.message,
      });
      res.status(403).json({
        error: "Your account is not authorized for this portal.",
        reason,
        authEmail,
      });
      return;
    }

    const profileMatches = (profilesByEmail ?? []).filter((candidate) => {
      const candidateEmail = normalizeEmail(candidate.email);
      return candidateEmail === normalizedEmail;
    });
    let profile: AuthenticatedRequest["currentProfile"] | null =
      profileById ??
      profileMatches.find((candidate) => candidate.id === authUserId) ??
      profileMatches[0] ??
      null;

    if (!profile) {
      const displayNameFromMetadata =
        typeof data.user.user_metadata?.display_name === "string"
          ? data.user.user_metadata.display_name.trim()
          : "";
      const fallbackDisplayName = normalizedEmail.split("@")[0] ?? normalizedEmail;

      const { data: insertedProfile, error: insertError } = await supabaseAdmin
        .from("internal_profiles")
        .insert({
          id: authUserId,
          email: normalizedEmail,
          display_name: displayNameFromMetadata || fallbackDisplayName,
          role: "internal",
          is_active: true,
        })
        .select(selectInternalProfileFields)
        .maybeSingle();

      if (insertError) {
        const reason = "profile_not_found";
        console.warn("[auth/profile] forbidden", {
          branch: reason,
          authEmail,
          authUserId,
          normalizedEmail,
          queryCount: (profileById ? 1 : 0) + profileMatches.length,
          activeFlags: profileMatches.map((candidate) => candidate.is_active),
          profileAutoCreateError: insertError.message,
        });
        res.status(403).json({
          error: "Your account is not authorized for this portal.",
          reason,
          authEmail,
        });
        return;
      }

      console.log("[auth/profile] auto-created internal profile", {
        authEmail,
        authUserId,
        normalizedEmail,
        profileId: insertedProfile?.id ?? null,
        role: insertedProfile?.role ?? null,
        is_active: insertedProfile?.is_active ?? null,
      });
      profile = insertedProfile ?? null;
    }

    console.log("[auth/profile] profile lookup result", {
      authEmail,
      authUserId,
      normalizedEmail,
      found: Boolean(profile),
      candidateCount: (profileById ? 1 : 0) + profileMatches.length,
      profileId: profile?.id ?? null,
      is_active: profile?.is_active ?? null,
      role: profile?.role ?? null,
    });

    if (!profile) {
      const reason = "profile_not_found";
      console.warn("[auth/profile] forbidden", {
        branch: reason,
        authEmail,
        authUserId,
        normalizedEmail,
        queryCount: (profileById ? 1 : 0) + profileMatches.length,
        activeFlags: profileMatches.map((candidate) => candidate.is_active),
      });
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
        authUserId,
        normalizedEmail,
        queryCount: (profileById ? 1 : 0) + profileMatches.length,
        activeFlags: [profile.is_active],
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
