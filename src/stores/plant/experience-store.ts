import { create } from "zustand";
import { analyzePlantImageFile } from "@/lib/plant/plants";
import type { PlantAttributeAnalysis } from "@/lib/plant/schemas";

interface PlantExperienceState {
  imageFile: File | null;
  previewUrl: string | null;
  analysis: PlantAttributeAnalysis | null;
  modelLabel: string;
  errorMessage: string | null;
  isSubmitting: boolean;

  setImageFile: (file: File | null) => void;
  analyzePlantImage: () => Promise<void>;
  reset: () => void;
}

export const usePlantExperienceStore = create<PlantExperienceState>()(
  (set, get) => ({
    imageFile: null,
    previewUrl: null,
    analysis: null,
    modelLabel: "Awaiting plant image",
    errorMessage: null,
    isSubmitting: false,

    setImageFile: (file) => {
      const currentUrl = get().previewUrl;
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl);
      }

      set({
        imageFile: file,
        previewUrl: file ? URL.createObjectURL(file) : null,
        analysis: null,
        errorMessage: null,
        modelLabel: "Awaiting plant image",
      });
    },

    analyzePlantImage: async () => {
      const { imageFile } = get();
      if (!imageFile) return;

      set({ isSubmitting: true, errorMessage: null });

      try {
        const data = await analyzePlantImageFile(imageFile);
        set({ analysis: data.analysis, modelLabel: data.model });
      } catch (error) {
        set({
          errorMessage:
            error instanceof Error
              ? error.message
              : "Plant analysis failed",
        });
      } finally {
        set({ isSubmitting: false });
      }
    },

    reset: () => {
      const currentUrl = get().previewUrl;
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl);
      }

      set({
        imageFile: null,
        previewUrl: null,
        analysis: null,
        modelLabel: "Awaiting plant image",
        errorMessage: null,
        isSubmitting: false,
      });
    },
  }),
);
