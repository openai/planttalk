import { PLANT_SENSOR_LIMITS, type PlantSensorKey, type PlantSensorReadings } from "@/lib/plant/sensors";
import type { PlantAttributeAnalysis, PlantObserverResponse } from "@/lib/plant/schemas";

// Client-side helpers for the two API endpoints. Images are sent as base64
// data URLs inside JSON bodies — simple to read on both ends, and the server
// forwards the data URL to the OpenAI API unchanged.

export interface PlantAnalysisResponse {
  analysis: PlantAttributeAnalysis;
  model: string;
}

export interface PlantObservationResponse extends PlantObserverResponse {
  sensorReadings: PlantSensorReadings;
  model: string;
}

export type PlantObserverReasoningStreamEvent =
  | { type: "reasoning_summary_delta"; delta: string }
  | { type: "reasoning_summary_done"; text: string }
  | { type: "reasoning_summary_part"; text: string }
  | { type: "reasoning_summary_part_done"; text: string }
  | { type: "reasoning_summary_unavailable"; message: string }
  | { type: "final"; data: PlantObservationResponse }
  | { type: "error"; error: string; detail?: string; code?: number | null; retryable?: boolean };

export interface PlantSensorField {
  key: PlantSensorKey;
  label: string;
  unit: string;
  helper: string;
  min: number;
  max: number;
  step: number;
}

export const placeholderPlantAnalysisJson = JSON.stringify(
  {
    dryness: "1-10",
    size: "millimeters",
    branching: "0-10",
    physicalTexture: "pending",
  },
  null,
  2,
);

export const plantSensorFields: PlantSensorField[] = [
  {
    key: "moisture",
    label: "Soil moisture",
    unit: "%",
    helper: "capacitive soil moisture probe in the pot",
    min: PLANT_SENSOR_LIMITS.moisture.min,
    max: PLANT_SENSOR_LIMITS.moisture.max,
    step: 1,
  },
  {
    key: "light",
    label: "Light",
    unit: "%",
    helper: "binary light sensor — above 50 reads as on",
    min: PLANT_SENSOR_LIMITS.light.min,
    max: PLANT_SENSOR_LIMITS.light.max,
    step: 1,
  },
];

const MAX_IMAGE_FILE_BYTES = 8 * 1024 * 1024;

export async function analyzePlantImageFile(imageFile: File): Promise<PlantAnalysisResponse> {
  assertImageFileSize(imageFile);

  const response = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: await fileToDataUrl(imageFile) }),
  });

  const data = await readJsonResponse<PlantAnalysisResponse>(response, "Plant analysis failed");
  return data;
}

// The simple, non-streaming way to run one observation — kept as the readable
// reference. The app itself uses observePlantFileWithReasoningStream below so
// the dashboard can show the model's reasoning summaries live.
export async function observePlantFile({
  imageFile,
  sensorReadings,
  hardwareSummary,
  historySummary,
}: {
  imageFile: File;
  sensorReadings: PlantSensorReadings;
  hardwareSummary: string;
  historySummary: string;
}): Promise<PlantObservationResponse> {
  assertImageFileSize(imageFile);

  const response = await fetch("/api/observe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image: await fileToDataUrl(imageFile),
      sensorReadings,
      hardwareSummary,
      historySummary,
    }),
  });

  const data = await readJsonResponse<PlantObservationResponse>(response, "Plant observation failed");
  return data;
}

export async function observePlantFileWithReasoningStream({
  imageFile,
  sensorReadings,
  hardwareSummary,
  historySummary,
  onEvent,
}: {
  imageFile: File;
  sensorReadings: PlantSensorReadings;
  hardwareSummary: string;
  historySummary: string;
  onEvent?: (event: PlantObserverReasoningStreamEvent) => void;
}): Promise<PlantObservationResponse> {
  assertImageFileSize(imageFile);

  const response = await fetch("/api/observe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image: await fileToDataUrl(imageFile),
      sensorReadings,
      hardwareSummary,
      historySummary,
      stream: true,
    }),
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;

    throw new Error(data?.error ?? `Plant observation stream failed (HTTP ${response.status})`);
  }

  if (!response.body) {
    throw new Error("Plant observation stream was not returned by the server");
  }

  let finalPayload: PlantObservationResponse | null = null;

  await consumeNdjsonStream(response.body, (line) => {
    const event = parseObserverReasoningStreamEvent(line);

    if (!event) {
      return;
    }

    onEvent?.(event);

    if (event.type === "error") {
      const detail = event.detail ? `${event.error} (${event.detail})` : event.error;
      const err = new Error(detail);
      (err as Error & { retryable?: boolean }).retryable = event.retryable ?? false;
      throw err;
    }

    if (event.type === "final") {
      finalPayload = event.data;
    }
  });

  if (!finalPayload) {
    throw new Error("Plant observation stream completed without final payload");
  }

  return finalPayload;
}

export function formatSensorValue(value: number, unit: string, step: number) {
  const formattedValue = step < 1 ? value.toFixed(1) : Math.round(value).toString();
  return `${formattedValue}${unit}`;
}

function assertImageFileSize(file: File) {
  if (file.size > MAX_IMAGE_FILE_BYTES) {
    throw new Error("The uploaded image must be 8 MB or smaller.");
  }
}

// Reads a JSON response, surviving non-JSON error bodies (e.g. the body-size
// limit returns an HTML 413 page, which response.json() would choke on).
async function readJsonResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
  const data = (await response.json().catch(() => null)) as (T & { error?: string }) | null;

  if (!response.ok || !data || data.error) {
    throw new Error(data?.error ?? `${fallbackMessage} (HTTP ${response.status})`);
  }

  return data;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read image file"));
    reader.readAsDataURL(file);
  });
}

function parseObserverReasoningStreamEvent(line: string): PlantObserverReasoningStreamEvent | null {
  let parsed: { type?: unknown; [key: string]: unknown };
  try {
    parsed = JSON.parse(line) as { type?: unknown; [key: string]: unknown };
  } catch {
    // A truncated line (e.g. the connection dropped mid-write) is not an
    // event — ignore it and let the missing-final-payload check report it.
    return null;
  }

  if (typeof parsed.type !== "string") {
    return null;
  }

  if (parsed.type === "reasoning_summary_delta" && typeof parsed.delta === "string") {
    return { type: parsed.type, delta: parsed.delta };
  }

  if (parsed.type === "reasoning_summary_done" && typeof parsed.text === "string") {
    return { type: parsed.type, text: parsed.text };
  }

  if (parsed.type === "reasoning_summary_part" && typeof parsed.text === "string") {
    return { type: parsed.type, text: parsed.text };
  }

  if (parsed.type === "reasoning_summary_part_done" && typeof parsed.text === "string") {
    return { type: parsed.type, text: parsed.text };
  }

  if (parsed.type === "reasoning_summary_unavailable" && typeof parsed.message === "string") {
    return { type: parsed.type, message: parsed.message };
  }

  if (parsed.type === "final" && parsed.data) {
    return {
      type: parsed.type,
      data: parsed.data as PlantObservationResponse,
    };
  }

  if (parsed.type === "error" && typeof parsed.error === "string") {
    // Keep detail/code/retryable — the observation loop's rate-limit backoff
    // depends on the retryable flag surviving this round trip.
    return {
      type: parsed.type,
      error: parsed.error,
      detail: typeof parsed.detail === "string" ? parsed.detail : undefined,
      code: typeof parsed.code === "number" ? parsed.code : null,
      retryable: parsed.retryable === true,
    };
  }

  return null;
}

async function consumeNdjsonStream(stream: ReadableStream<Uint8Array>, onLine: (line: string) => void) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      let newlineIndex = buffer.indexOf("\n");

      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        onLine(line.trim());
        newlineIndex = buffer.indexOf("\n");
      }
    }

    const trailingText = buffer.trim();

    if (trailingText) {
      onLine(trailingText);
    }
  } finally {
    try {
      await reader.cancel();
    } catch {}
  }
}
