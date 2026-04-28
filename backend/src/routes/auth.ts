import { Router } from "express";
import type { Request, Response } from "express";

import { resolveCurrentProfile } from "../lib/currentProfile";
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
      res.status(401).json({ error: "Missing bearer token." });
      return;
    }

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) {
      res.status(401).json({ error: "Invalid auth token." });
      return;
    }

    const profile = await resolveCurrentProfile(supabaseAdmin, {
      authUserId: data.user.id,
      email: data.user.email,
    });

    if (!profile || !profile.is_active) {
      res.status(403).json({ error: "Your account is not authorized for this portal." });
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
