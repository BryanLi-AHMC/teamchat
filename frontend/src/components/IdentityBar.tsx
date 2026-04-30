import { THEME_COLORS } from "../constants/themeColors";
import type { PetOption } from "../constants/pets";

export type IdentityBarProps = {
  /** Theme id (e.g. `purple`, `blue`), from `THEME_COLORS`. */
  selectedThemeColor: string;
  selectedPetId: string;
  petOptions: PetOption[];
  onPetChange: (petId: string) => void;
  onThemeColorChange: (themeId: string) => void;
  onSave?: () => void;
  /** When set (e.g. modal), shows a close control and should dismiss the host overlay. */
  onRequestClose?: () => void;
};

// TODO: Persist selected pet/theme to user_profiles in Supabase (see localStorage for now).

function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      width="12"
      height="12"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M16.707 5.293a1 1 0 010 1.414l-7.25 7.25a1 1 0 01-1.414 0l-3.25-3.25a1 1 0 111.414-1.414l2.543 2.543 6.543-6.543a1 1 0 011.414 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function IdentityBar({
  selectedPetId,
  selectedThemeColor,
  petOptions,
  onPetChange,
  onThemeColorChange,
  onSave,
  onRequestClose,
}: IdentityBarProps) {
  const handleSaveClick = () => {
    onSave?.();
  };

  return (
    <div
      id="teamchat-identity-bar"
      className={`identity-bar shrink-0 w-full ${onRequestClose ? "identity-bar--modal" : ""}`.trim()}
    >
      <div className="identity-bar-panel w-full max-w-full">
        <div
          className={`identity-bar-header min-w-0${onRequestClose ? " identity-bar-header--with-actions" : ""}`.trim()}
        >
          <p id="teamchat-identity-dialog-title" className="identity-bar-title">
            Choose Your Identity
          </p>
          {onRequestClose ? (
            <button
              type="button"
              className="identity-bar-close"
              onClick={onRequestClose}
              aria-label="Close"
            >
              ×
            </button>
          ) : null}
        </div>
        {onSave ? (
          <button
            type="button"
            onClick={handleSaveClick}
            className="identity-bar-save shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              backgroundColor: "var(--teamchat-accent)",
              outlineColor: "var(--teamchat-accent)",
            }}
          >
            Save
          </button>
        ) : null}
        <div className="identity-bar-sections">
            <section className="identity-bar-section choose-pet-section">
              <div
                className="identity-bar-pet-container identity-pet-grid pet-picker-grid w-full max-w-full"
                role="listbox"
                aria-label="Pet avatars"
              >
                {petOptions.map((pet) => {
                  const isSelected = pet.id === selectedPetId;
                  return (
                    <button
                      key={pet.id}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      title={pet.name}
                      onClick={() => onPetChange(pet.id)}
                      className={`pet-option ${isSelected ? "pet-option--selected selected" : ""} relative flex shrink-0 items-center justify-center rounded-xl p-1 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
                        isSelected ? "" : "ring-1 ring-transparent hover:bg-white/70"
                      }`}
                      style={
                        isSelected
                          ? {
                              outlineColor: "var(--teamchat-accent)",
                            }
                          : undefined
                      }
                    >
                      <span className="sr-only">{pet.name}</span>
                      <img
                        src={pet.imageUrl}
                        alt=""
                        className="pointer-events-none rounded-lg object-contain"
                        width={40}
                        height={40}
                      />
                      {isSelected ? (
                        <span
                          className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full text-white shadow-sm ring-2 ring-white"
                          style={{ backgroundColor: "var(--teamchat-accent)" }}
                          aria-hidden
                        >
                          <CheckIcon className="h-3 w-3" />
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="identity-bar-section team-color-section">
              <div
                className="identity-bar-color-row flex flex-wrap items-center overflow-x-hidden px-0.5 py-0.5"
                role="listbox"
                aria-label="Theme color"
              >
                {THEME_COLORS.map((t) => {
                  const isActive = t.id === selectedThemeColor;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      title={t.label}
                      onClick={() => onThemeColorChange(t.id)}
                      className={`color-dot relative shrink-0 rounded-full border-2 border-white shadow-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
                        isActive ? "ring-2 ring-offset-2" : "ring-0"
                      }`}
                      style={{
                        backgroundColor: t.accent,
                        outlineColor: isActive ? t.accent : undefined,
                        boxShadow: isActive
                          ? `0 0 0 2px ${t.accent}, 0 0 0 4px color-mix(in srgb, ${t.accent} 35%, white)`
                          : undefined,
                      }}
                    >
                      <span className="sr-only">{t.label}</span>
                      {isActive ? (
                        <span className="absolute inset-0 m-auto flex h-4 w-4 items-center justify-center text-white drop-shadow">
                          <CheckIcon className="h-3.5 w-3.5" />
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </section>
        </div>
      </div>
    </div>
  );
}
