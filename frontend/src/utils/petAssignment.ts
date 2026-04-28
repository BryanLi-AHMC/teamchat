/**
 * Deterministic pet pick per user id/name (no Math.random per render).
 * TODO: Prefer persistent `internal_profiles.pet_id` (or `user_profiles.pet_id`) once migrated.
 * TODO: Persist theme color to `user_profiles` with localStorage keys `teamchat:selectedThemeColor` / `teamchat:selectedPetId` as interim.
 */

import { isValidPetId } from "../constants/pets";
import type { InternalProfile } from "../lib/authProfile";

function hashString(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (Math.imul(31, h) + input.charCodeAt(i)) | 0;
  }
  return h === -2147483648 ? 0 : Math.abs(h);
}

/**
 * @returns assigned pet id, or `null` when there are no pets to choose from.
 */
export function getAssignedPetIdForUser(userIdOrName: string, availablePetIds: string[]): string | null {
  if (availablePetIds.length === 0) {
    return null;
  }
  const h = hashString(userIdOrName);
  return availablePetIds[h % availablePetIds.length] ?? null;
}

/**
 * Current user: `selectedPetId` from storage; others: `profile.pet_id` or deterministic assignment.
 */
export function resolvePetIdForProfile(
  profile: InternalProfile | undefined,
  selfId: string | undefined,
  selectedPetId: string | null | undefined,
  availablePetIds: string[]
): string | null {
  if (!profile || !selfId) {
    return null;
  }
  if (profile.id === selfId) {
    if (selectedPetId && isValidPetId(selectedPetId)) {
      return selectedPetId;
    }
    return getAssignedPetIdForUser(profile.id, availablePetIds);
  }
  const stored = profile.pet_id;
  if (stored && isValidPetId(stored)) {
    return stored;
  }
  return getAssignedPetIdForUser(profile.id, availablePetIds);
}
