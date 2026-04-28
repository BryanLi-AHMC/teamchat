import { Router } from "express";
import type { Request, Response } from "express";

import { emitUserStatsUpdated } from "../lib/realtime";
import { supabaseAdmin } from "../lib/supabase";

type AuthedRequest = Request & {
  userId?: string;
};

const DAILY_UPDATE_XP = 20;

function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}-${`${date.getDate()}`.padStart(2, "0")}`;
}

function getXpRequiredForLevel(level: number): number {
  if (!Number.isFinite(level) || level < 1) {
    return Math.round(100 * Math.pow(1.5, 0));
  }
  return Math.round(100 * Math.pow(1.5, level - 1));
}

function getLevelProgress(totalXp: number): { level: number } {
  const safe = Math.max(0, Math.floor(totalXp));
  let level = 1;
  let floor = 0;
  while (true) {
    const span = getXpRequiredForLevel(level);
    if (safe < floor + span) {
      return { level };
    }
    floor += span;
    level += 1;
  }
}

async function requireAuth(req: Request, res: Response, next: () => void) {
  if (!supabaseAdmin) {
    res.status(500).json({ error: "Supabase admin is not configured." });
    return;
  }

  const authHeader = req.header("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) {
    res.status(401).json({ error: "Missing auth token." });
    return;
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    res.status(401).json({ error: "Invalid auth token." });
    return;
  }

  (req as AuthedRequest).userId = data.user.id;
  next();
}

export const profileStatsRouter = Router();

profileStatsRouter.post("/me/award-update-xp", requireAuth, async (req, res) => {
  try {
    const userId = (req as AuthedRequest).userId;
    if (!userId) {
      res.status(401).json({ error: "Not authenticated." });
      return;
    }

    const { data: profile, error: profileError } = await supabaseAdmin!
      .from("internal_profiles")
      .select("id,is_active,xp_total,points,level,streak,last_xp_awarded_date")
      .eq("id", userId)
      .maybeSingle();

    if (profileError) {
      throw new Error(profileError.message);
    }
    if (!profile || !profile.is_active) {
      res.status(403).json({ error: "Your account is not authorized for this portal." });
      return;
    }

    const today = new Date();
    const todayKey = toIsoDate(today);
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const yesterdayKey = toIsoDate(yesterday);

    const previousXp = Math.max(0, Number(profile.xp_total ?? 0));
    const nextXp = previousXp + DAILY_UPDATE_XP;
    const nextLevel = getLevelProgress(nextXp).level;
    const previousAwardDate =
      typeof profile.last_xp_awarded_date === "string" ? profile.last_xp_awarded_date : null;
    const nextStreak =
      previousAwardDate === todayKey ? Math.max(1, Number(profile.streak ?? 0)) : previousAwardDate === yesterdayKey ? Math.max(0, Number(profile.streak ?? 0)) + 1 : 1;

    const { data: updated, error: updateError } = await supabaseAdmin!
      .from("internal_profiles")
      .update({
        xp_total: nextXp,
        points: nextXp,
        level: nextLevel,
        streak: nextStreak,
        last_xp_awarded_date: todayKey,
      })
      .eq("id", userId)
      .select("id,xp_total,points,level,streak")
      .single();

    if (updateError || !updated) {
      throw new Error(updateError?.message ?? "Unable to update stats.");
    }

    const payload = {
      userId: updated.id,
      xp: Number(updated.xp_total ?? 0),
      points: Number(updated.points ?? updated.xp_total ?? 0),
      level: Number(updated.level ?? 1),
      streak: Number(updated.streak ?? 0),
    };
    emitUserStatsUpdated(payload);
    res.json({ data: payload });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unable to award XP.",
    });
  }
});
