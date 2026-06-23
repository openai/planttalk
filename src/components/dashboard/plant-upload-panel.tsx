import { usePlantExperienceStore } from "@/stores/plant/experience-store";

export function PlantUploadPanel() {
  const imageFile = usePlantExperienceStore((s) => s.imageFile);
  const previewUrl = usePlantExperienceStore((s) => s.previewUrl);
  const errorMessage = usePlantExperienceStore((s) => s.errorMessage);
  const isSubmitting = usePlantExperienceStore((s) => s.isSubmitting);
  const setImageFile = usePlantExperienceStore((s) => s.setImageFile);
  const analyzePlantImage = usePlantExperienceStore((s) => s.analyzePlantImage);

  return (
    <article>
      <header>
        <strong>Plant image intake</strong>
      </header>

      <p>
        <small>
          Use a clear photo of one plant. If the frame contains more than one, the API targets the most dominant
          subject.
        </small>
      </p>

      <label>
        Plant photo (JPG, PNG, or WebP up to 8 MB)
        <input type="file" accept="image/*" onChange={(event) => setImageFile(event.target.files?.[0] ?? null)} />
      </label>

      {previewUrl && <img src={previewUrl} alt="Selected plant preview" />}

      <footer>
        <button
          type="button"
          disabled={!imageFile || isSubmitting}
          aria-busy={isSubmitting}
          onClick={analyzePlantImage}
        >
          {isSubmitting ? "Analyzing image…" : "Analyze plant image"}
        </button>

        {errorMessage && (
          <p>
            <mark>{errorMessage}</mark>
          </p>
        )}
      </footer>
    </article>
  );
}
