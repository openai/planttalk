import { z } from "zod";

// Zod schemas for OpenAI structured outputs.

const OBSERVER_THOUGHT_MAX_LENGTH = 120;
const OBSERVER_HYPOTHESIS_MAX_LENGTH = 120;

// One-shot image analysis (the upload tester).
export const plantAttributeAnalysisSchema = z.object({
  dryness: z
    .number()
    .int()
    .min(1)
    .max(10)
    .describe("Estimated dryness on a 1 to 10 scale, where 1 is fully hydrated and 10 is severely dry."),
  size: z
    .number()
    .int()
    .min(1)
    .max(5000)
    .describe("Estimated maximum visible span of the dominant plant in millimeters."),
  branching: z
    .number()
    .int()
    .min(0)
    .max(10)
    .describe(
      "Estimated branching complexity on a 0 to 10 scale based on visible stems, offshoots, or canopy splitting.",
    ),
  physicalTexture: z
    .string()
    .min(2)
    .max(80)
    .describe("Short tactile surface description such as waxy, smooth, fuzzy, fibrous, papery, rough, or spiky."),
});

export const plantTrendDirectionSchema = z
  .enum(["improving", "stable", "declining", "insufficient-data"])
  .describe("Directional read of the plant's wellbeing relative to prior observations.");

export const plantObserverThoughtSchema = z
  .string()
  .min(18)
  .max(OBSERVER_THOUGHT_MAX_LENGTH)
  .describe("A user-visible observer checkpoint grounded in current sensors, visual evidence, or recent history.");

// Periodic observation records saved to the plant's memory.
export const plantObserverResponseSchema = z.object({
  observerThoughts: z
    .array(plantObserverThoughtSchema)
    .min(3)
    .max(6)
    .describe(
      "Short interstitial messages that summarize the model's evidence checks without exposing private chain-of-thought.",
    ),
  observation: z
    .string()
    .min(12)
    .max(160)
    .describe(
      "One neutral, empirical sentence recording what is visible now and how it compares to prior observations.",
    ),
  hypothesis: z
    .string()
    .min(12)
    .max(OBSERVER_HYPOTHESIS_MAX_LENGTH)
    .describe("A short, falsifiable hypothesis about the plant's current state and likely next change."),
  trend: plantTrendDirectionSchema,
  dryness: z
    .number()
    .int()
    .min(1)
    .max(10)
    .describe("Estimated dryness on a 1 to 10 scale, where 1 is fully hydrated and 10 is severely dry."),
});

export type PlantAttributeAnalysis = z.infer<typeof plantAttributeAnalysisSchema>;
export type PlantTrendDirection = z.infer<typeof plantTrendDirectionSchema>;
export type PlantObserverThought = z.infer<typeof plantObserverThoughtSchema>;
export type PlantObserverResponse = z.infer<typeof plantObserverResponseSchema>;
