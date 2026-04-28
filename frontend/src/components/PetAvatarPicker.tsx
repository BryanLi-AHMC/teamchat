import {
  PET_OPTIONS,
  PET_PIPELINE_HELPER_TEXT,
  shouldShowPetPipelineHelper,
} from "../constants/pets";

export type PetAvatarPickerProps = {
  selectedPetId: string;
  onChange: (petId: string) => void;
  className?: string;
};

export function PetAvatarPicker({ selectedPetId, onChange, className = "" }: PetAvatarPickerProps) {
  const showPipelineHint = shouldShowPetPipelineHelper();

  if (PET_OPTIONS.length === 0) {
    return (
      <p className={`text-xs text-slate-500 ${className}`.trim()} role="status">
        {PET_PIPELINE_HELPER_TEXT}
      </p>
    );
  }

  return (
    <div id="teamchat-pet-avatar-picker" className={`flex flex-col gap-1.5 ${className}`.trim()}>
      {showPipelineHint ? (
        <p className="text-xs leading-snug text-slate-500" role="status">
          {PET_PIPELINE_HELPER_TEXT}
        </p>
      ) : null}
      <div
        className="grid max-h-[min(40vh,16rem)] grid-cols-[repeat(auto-fill,minmax(2.25rem,1fr))] gap-2 overflow-y-auto overflow-x-hidden pr-0.5 [scrollbar-gutter:stable]"
        role="listbox"
        aria-label="Choose a pet avatar"
      >
        {PET_OPTIONS.map((pet) => {
          const isSelected = pet.id === selectedPetId;
          return (
            <button
              key={pet.id}
              type="button"
              role="option"
              aria-selected={isSelected}
              title={pet.name}
              onClick={() => onChange(pet.id)}
              className={`rounded-lg p-0.5 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--teamchat-accent)] ${
                isSelected
                  ? "ring-2 ring-[color:var(--teamchat-accent)] ring-offset-2 ring-offset-[#f7f6f9]"
                  : "ring-1 ring-transparent hover:bg-white/60"
              }`}
            >
              <span className="sr-only">{pet.name}</span>
              <img
                src={pet.imageUrl}
                alt=""
                className="pet-avatar__img pet-avatar__img--pixel pointer-events-none mx-auto h-9 w-9 rounded-md object-contain"
                width={36}
                height={36}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
