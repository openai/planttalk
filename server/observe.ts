// OpenAI request handlers for image analysis and periodic observations.

import type { Request, Response } from "express";
import type OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { ensureApiKey, getOpenAI } from "./openai";
import { writeApiResponseLog } from "../src/lib/api/response-logging";
import { PLANT_ANALYSIS_PROMPTS, PLANT_OBSERVER_PROMPTS } from "../src/lib/plant/prompts";
import { plantAttributeAnalysisSchema, plantObserverResponseSchema } from "../src/lib/plant/schemas";
import {
  PLANT_SENSOR_LIMITS,
  describeLightReading,
  type PlantSensorKey,
  type PlantSensorReadings,
} from "../src/lib/plant/sensors";

const plantAnalysisModel = "gpt-5.4";
const observerReasoningSummaryMode = "auto";
const observerReasoningEffortMode = "medium";

const MAX_IMAGE_DATA_URL_LENGTH = 11 * 1024 * 1024; // ~8 MB of image data once base64-encoded

// Hard ceiling for a single model call. Medium-effort observations finish well
// inside this; the ceiling only exists so a stalled request fails on its own
// instead of riding the SDK's ~10-minute default and wedging the observe loop
// (which blocks every later observation until the server restarts).
const MODEL_CALL_TIMEOUT_MS = 120_000;

// POST /api/analyze

export async function handleAnalyzeRequest(req: Request, res: Response) {
  if (!ensureApiKey(res)) return;

  const imageDataUrl = validateImageDataUrl(req.body?.image, res);
  if (!imageDataUrl) return;

  try {
    const response = await getOpenAI().responses.parse(
      {
        model: plantAnalysisModel,
        input: [
          {
            role: "system",
            content: [{ type: "input_text", text: PLANT_ANALYSIS_PROMPTS.system }],
          },
          {
            role: "user",
            content: [
              { type: "input_text", text: PLANT_ANALYSIS_PROMPTS.user },
              { type: "input_image", image_url: imageDataUrl, detail: "high" },
            ],
          },
        ],
        text: {
          format: zodTextFormat(plantAttributeAnalysisSchema, "plant_attribute_analysis"),
        },
      },
      // Stop paying for the model call if the browser goes away mid-request,
      // or if it stalls past the time ceiling.
      { signal: abortOnDisconnectOrTimeout(res) },
    );

    if (!response.output_parsed) {
      res.status(502).json({ error: "The model did not return a structured plant analysis." });
      return;
    }

    res.json({
      analysis: plantAttributeAnalysisSchema.parse(response.output_parsed),
      model: `${plantAnalysisModel} structured vision`,
    });
  } catch (error) {
    console.error("Plant analysis error:", error);
    res.status(500).json({ error: "Failed to analyze the plant image." });
  }
}

// POST /api/observe

export async function handleObserveRequest(req: Request, res: Response) {
  if (!ensureApiKey(res)) return;

  const imageDataUrl = validateImageDataUrl(req.body?.image, res);
  if (!imageDataUrl) return;

  const sensorReadings = parseSensorReadings(req.body?.sensorReadings);
  if (!sensorReadings) {
    res.status(400).json({ error: "Valid sensor readings are required for observation." });
    return;
  }

  const hardwareSummary =
    readBoundedString(req.body?.hardwareSummary, 600) ?? "arduino=not_connected; sensor_data=fallback_sliders";
  const historySummary = readBoundedString(req.body?.historySummary, 4000) ?? "No prior observations recorded yet.";
  const shouldStream = req.body?.stream === true;

  const modelInput = [
    {
      role: "system" as const,
      content: [{ type: "input_text" as const, text: PLANT_OBSERVER_PROMPTS.system }],
    },
    {
      role: "user" as const,
      content: [
        {
          type: "input_text" as const,
          text: PLANT_OBSERVER_PROMPTS.user({
            sensorSummary: formatSensorSummary(sensorReadings),
            hardwareSummary,
            historySummary,
          }),
        },
        { type: "input_image" as const, image_url: imageDataUrl, detail: "auto" as const },
      ],
    },
  ];

  if (shouldStream) {
    await streamObserverReasoning({ res, modelInput, sensorReadings });
    return;
  }

  try {
    const response = await getOpenAI().responses.parse(
      {
        model: plantAnalysisModel,
        input: modelInput,
        text: {
          format: zodTextFormat(plantObserverResponseSchema, "plant_observer_response"),
        },
      },
      { signal: abortOnDisconnectOrTimeout(res) },
    );

    if (!response.output_parsed) {
      res.status(502).json({ error: "The model did not return a structured plant observation." });
      return;
    }

    const payload = {
      ...plantObserverResponseSchema.parse(response.output_parsed),
      sensorReadings,
      model: `${plantAnalysisModel} structured plant observer`,
    };
    writeApiResponseLog(payload);
    res.json(payload);
  } catch (error) {
    console.error("Plant observation error:", error);
    res.status(500).json({ error: "Failed to observe the plant." });
  }
}

// Streams reasoning summaries as NDJSON, followed by the final observation.
async function streamObserverReasoning({
  res,
  modelInput,
  sensorReadings,
}: {
  res: Response;
  modelInput: OpenAI.Responses.ResponseInput;
  sensorReadings: PlantSensorReadings;
}) {
  res.status(200);
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  const send = (payload: unknown) => {
    res.write(`${JSON.stringify(payload)}\n`);
  };

  const responseStream = getOpenAI().responses.stream({
    model: plantAnalysisModel,
    input: modelInput,
    reasoning: {
      summary: observerReasoningSummaryMode,
      effort: observerReasoningEffortMode,
    },
    text: {
      format: zodTextFormat(plantObserverResponseSchema, "plant_observer_response"),
    },
  });

  // Abort the OpenAI request if the browser goes away mid-stream, or if the
  // stream stalls past the time ceiling (so a hung observation can't keep the
  // loop's `isSubmitting` flag stuck and block every later observation).
  res.on("close", () => {
    if (!res.writableEnded) {
      responseStream.abort();
    }
  });
  const stallTimer = setTimeout(() => responseStream.abort(), MODEL_CALL_TIMEOUT_MS);

  let reasoningEventCount = 0;

  try {
    for await (const event of responseStream) {
      if (event.type === "response.reasoning_summary_text.delta" && event.delta) {
        reasoningEventCount += 1;
        send({ type: "reasoning_summary_delta", delta: event.delta });
      }

      if (event.type === "response.reasoning_summary_text.done" && event.text) {
        reasoningEventCount += 1;
        send({ type: "reasoning_summary_done", text: event.text });
      }

      if (
        event.type === "response.reasoning_summary_part.added" &&
        event.part.type === "summary_text" &&
        event.part.text
      ) {
        reasoningEventCount += 1;
        send({ type: "reasoning_summary_part", text: event.part.text });
      }

      if (
        event.type === "response.reasoning_summary_part.done" &&
        event.part.type === "summary_text" &&
        event.part.text
      ) {
        reasoningEventCount += 1;
        send({ type: "reasoning_summary_part_done", text: event.part.text });
      }
    }

    const finalResponse = await responseStream.finalResponse();

    if (!finalResponse.output_parsed) {
      send({ type: "error", error: "The model did not return a structured plant observation." });
      return;
    }

    const observerResponse = plantObserverResponseSchema.parse(finalResponse.output_parsed);

    if (reasoningEventCount === 0) {
      send({
        type: "reasoning_summary_unavailable",
        message: "No reasoning summary events were emitted for this request.",
      });
    }

    const payload = {
      ...observerResponse,
      sensorReadings,
      model: `${plantAnalysisModel} structured plant observer`,
    };
    writeApiResponseLog(payload);
    send({ type: "final", data: payload });
  } catch (error) {
    console.error("Observer reasoning stream error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorCode =
      error && typeof error === "object" && "status" in error ? (error as { status?: number }).status : undefined;
    send({
      type: "error",
      error: "Failed to stream observer reasoning summary.",
      detail: errorMessage,
      code: errorCode ?? null,
      retryable:
        errorCode === 429 ||
        errorCode === 503 ||
        errorMessage.includes("ECONNRESET") ||
        errorMessage.includes("timeout") ||
        errorMessage.includes("aborted"),
    });
  } finally {
    clearTimeout(stallTimer);
    res.end();
  }
}

// Shared helpers

// Abort a non-streaming model call when the browser disconnects OR a hard time
// ceiling is hit, so a stalled request can't hang on the SDK's long default.
function abortOnDisconnectOrTimeout(res: Response) {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error(`Model call exceeded ${MODEL_CALL_TIMEOUT_MS}ms`)),
    MODEL_CALL_TIMEOUT_MS,
  );
  res.on("close", () => {
    clearTimeout(timer);
    if (!res.writableEnded) controller.abort();
  });
  res.on("finish", () => clearTimeout(timer));
  return controller.signal;
}

function validateImageDataUrl(value: unknown, res: Response): string | null {
  if (typeof value !== "string" || !value.startsWith("data:image/")) {
    res.status(400).json({ error: "A plant image is required (as a data URL)." });
    return null;
  }

  if (value.length > MAX_IMAGE_DATA_URL_LENGTH) {
    res.status(400).json({ error: "The uploaded image must be 8 MB or smaller." });
    return null;
  }

  return value;
}

function readBoundedString(value: unknown, maxLength: number) {
  if (typeof value !== "string" || !value.trim()) return null;
  return value.slice(0, maxLength);
}

function parseSensorReadings(value: unknown): PlantSensorReadings | null {
  if (typeof value !== "object" || value === null) return null;

  try {
    const parsedValue = value as Partial<PlantSensorReadings>;
    return {
      moisture: normalizeSensorValue(parsedValue.moisture, "moisture"),
      light: normalizeSensorValue(parsedValue.light, "light"),
    } satisfies PlantSensorReadings;
  } catch {
    return null;
  }
}

function normalizeSensorValue(value: unknown, key: PlantSensorKey) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error("Invalid sensor reading");
  }

  const limits = PLANT_SENSOR_LIMITS[key];
  return Math.min(Math.max(value, limits.min), limits.max);
}

function formatSensorSummary(sensorReadings: PlantSensorReadings) {
  return [
    `soil moisture: ${Math.round(sensorReadings.moisture)}%`,
    `light sensor: ${describeLightReading(sensorReadings.light)} (binary — on when the light above the plant is lit)`,
  ].join("; ");
}
