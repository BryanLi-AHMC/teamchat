/**
 * Pet avatars use PNG previews only (Kenney Cube Pets pack: `kenney_cube-pets_1.0/Previews/`).
 * Files live in `public/assets/pets/`. After adding images, run `npm run sync-pets`.
 */

import { PET_ASSET_SLUGS } from "./pet-asset-slugs";

export type PetCategory = "animal";

export type PetOption = {
  id: string;
  name: string;
  imageUrl: string;
  category: PetCategory;
};

/** Shown when there are fewer than this many PNG previews (pack not fully synced or FBX-only). */
export const PET_PIPELINE_HINT_MIN_COUNT = 10;

export const PET_PIPELINE_HELPER_TEXT =
  "Only PNG pet previews are available. FBX models need to be exported to PNG first.";

function slugToDisplayName(slug: string): string {
  return slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export const PET_OPTIONS: PetOption[] = PET_ASSET_SLUGS.map((id) => ({
  id,
  name: slugToDisplayName(id),
  imageUrl: `/assets/pets/${id}.png`,
  category: "animal",
}));

export function shouldShowPetPipelineHelper(): boolean {
  return PET_OPTIONS.length < PET_PIPELINE_HINT_MIN_COUNT;
}

const petById = new Map(PET_OPTIONS.map((p) => [p.id, p]));

export function getPetOptionById(id: string): PetOption | undefined {
  return petById.get(id);
}

export function isValidPetId(id: string | null | undefined): id is string {
  return Boolean(id && petById.has(id));
}
