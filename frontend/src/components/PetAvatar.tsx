import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { getPetOptionById, isValidPetId } from "../constants/pets";

function getInitials(displayName: string) {
  const words = displayName
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) {
    return "?";
  }

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}

/** Pixel Kenney previews are 64×64; upscale with crisp pixels. */
const IMG_PIXEL_CLASSES = "pet-avatar__img pet-avatar__img--pixel max-h-full max-w-full object-contain p-0.5";

const SIZE_CLASSES: Record<"xs" | "sm" | "md" | "lg" | "xl", string> = {
  xs: "h-6 w-6 min-h-[24px] min-w-[24px] text-[10px]",
  sm: "h-8 w-8 min-h-[32px] min-w-[32px] text-xs",
  md: "h-11 w-11 min-h-[44px] min-w-[44px] text-[13px]",
  lg: "h-[72px] w-[72px] min-h-[72px] min-w-[72px] text-sm",
  xl: "h-24 w-24 min-h-[96px] min-w-[96px] text-base",
};

export type PetAvatarProps = {
  petId?: string | null;
  /** Used when there is no valid pet id (same as profile `avatar_url`). */
  imageUrl?: string | null;
  /** Display name used for initials when no pet image loads. */
  label: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  /** Soft square preserves full pet art with object-contain (no circular crop). */
  clip?: "soft" | "circle";
  className?: string;
  /** Gentle idle float (use for dashboard / featured pets). */
  animated?: boolean;
  style?: CSSProperties;
};

export function PetAvatar({
  petId,
  imageUrl,
  label,
  size = "sm",
  clip = "soft",
  className = "",
  animated = false,
  style,
}: PetAvatarProps) {
  const roundClass = clip === "soft" ? "rounded-2xl" : "rounded-full";
  const [petSrcFailed, setPetSrcFailed] = useState(false);
  const [urlSrcFailed, setUrlSrcFailed] = useState(false);

  const petValid = Boolean(petId && isValidPetId(petId));
  const option = petValid ? getPetOptionById(petId as string) : undefined;

  useEffect(() => {
    setPetSrcFailed(false);
    setUrlSrcFailed(false);
  }, [petId, option?.imageUrl, imageUrl]);

  const baseShell = `pet-avatar inline-flex shrink-0 items-center justify-center overflow-hidden border border-[#d9cee7] bg-[#f2ecf9] font-bold text-[#4b2f68] ${roundClass} ${SIZE_CLASSES[size]}`;

  const wrapInner = (node: ReactNode) =>
    animated ? (
      <span className="pet-avatar__bob inline-flex h-full w-full items-center justify-center">{node}</span>
    ) : (
      node
    );

  const handlePetError = () => {
    if (option?.imageUrl) {
      console.warn(`[PetAvatar] Missing pet image for petId=${String(petId)} imageUrl=${option.imageUrl}`);
    } else {
      console.warn(`[PetAvatar] Missing pet image for petId=${String(petId)}`);
    }
    setPetSrcFailed(true);
  };

  if (option && !petSrcFailed) {
    const petImgClass =
      clip === "soft"
        ? `h-full w-full ${IMG_PIXEL_CLASSES}`
        : "pet-avatar__img pet-avatar__img--pixel h-full w-full object-cover";

    return (
      <span
        style={style}
        className={`${baseShell} border-transparent bg-transparent p-0 ${animated ? "pet-avatar--hover-scale" : ""} ${className}`.trim()}
      >
        {wrapInner(
          <img
            src={option.imageUrl}
            alt=""
            className={petImgClass}
            onError={handlePetError}
            loading="lazy"
            decoding="async"
          />
        )}
      </span>
    );
  }

  if (imageUrl && !petValid && !urlSrcFailed) {
    return (
      <span style={style} className={`${baseShell} p-0 ${className}`.trim()}>
        <img
          src={imageUrl}
          alt=""
          className={`pet-avatar__img h-full w-full ${clip === "soft" ? "object-contain" : "object-cover"}`}
          style={{ imageRendering: "auto" }}
          onError={() => setUrlSrcFailed(true)}
          loading="lazy"
          decoding="async"
        />
      </span>
    );
  }

  return (
    <span style={style} className={`${baseShell} ${className}`.trim()}>
      {getInitials(label)}
    </span>
  );
}
