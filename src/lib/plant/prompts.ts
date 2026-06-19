// Prompt text for the two OpenAI vision calls. These stay neutral; the plant's
// personality lives in realtime-config.ts.

const plantAnalysisJsonContract = [
  "Return exactly one JSON object with exactly these four keys:",
  '{"dryness": integer, "size": integer, "branching": integer, "physicalTexture": string}',
  '"dryness" must be an integer from 1 to 10.',
  '"size" must be an integer from 1 to 5000 representing the dominant plant\'s maximum visible span in millimeters.',
  '"branching" must be an integer from 0 to 10.',
  '"physicalTexture" must be a short tactile surface descriptor string, 2 to 80 characters.',
  "Use those key names exactly, include all four keys, and do not return any additional keys.",
  "Do not wrap the JSON in markdown, prose, explanations, or code fences.",
  "Do not use null, arrays, nested objects, or units inside string values.",
].join(" ");

export const PLANT_ANALYSIS_PROMPTS = {
  system: [
    "You analyze a single photo of a plant and return four structured attributes.",
    "Focus on the most visually dominant plant if the frame contains multiple plants.",
    "Estimate dryness on a 1 to 10 scale, where 1 means hydrated and supple and 10 means visibly dry or crisp.",
    "Estimate size as the dominant plant's maximum visible span in millimeters.",
    "If a U.S. quarter is visible in the frame, use it as a sizing reference with a diameter of 24.26 millimeters.",
    "When the quarter is visible, prefer quarter-relative scale over generic object-size guessing.",
    "Estimate branching on a 0 to 10 scale based on visible stems, offshoots, and canopy splitting.",
    "Physical texture must be a short tactile descriptor grounded in visible plant surfaces.",
    "Use conservative best-effort estimates when the image is imperfect.",
    plantAnalysisJsonContract,
    "Return only the structured analysis.",
  ].join(" "),
  user: [
    "Analyze the uploaded plant image.",
    "Return dryness, size, branching, and physicalTexture for the dominant plant.",
    "If a U.S. quarter is visible, use its 24.26 millimeter diameter to improve the size estimate.",
    plantAnalysisJsonContract,
    "Use only grounded visual evidence and best-effort real-world estimation.",
  ].join(" "),
} as const;

const plantObserverJsonContract = [
  "Return exactly one JSON object with these keys: observerThoughts, observation, hypothesis, trend, dryness.",
  "observerThoughts is an array of 3 to 6 short user-visible checkpoint messages, each 18 to 120 characters.",
  "observerThoughts should read like a careful observer thinking out loud, each anchored in a concrete sensor reading, visual detail, or change from the history. They are presentation copy, not private chain-of-thought.",
  "observation is one neutral, empirical sentence under 160 characters recording what is visible now, compared against prior observations when present.",
  "hypothesis is one short, falsifiable statement under 120 characters about the plant's current state and likely next change.",
  "trend is one of: improving, stable, declining, insufficient-data.",
  "dryness is an integer from 1 (fully hydrated) to 10 (severely dry).",
  "Do not wrap the JSON in markdown, prose, or code fences. No null values, no extra keys.",
].join(" ");

export const PLANT_OBSERVER_PROMPTS = {
  system: [
    "You are a careful scientific observer running a periodic observation loop on a single houseplant.",
    "Each cycle you receive one fresh photo, a small sensor snapshot (soil moisture percentage and a binary grow-light reading), a hardware status line, and a compact log of recent prior observations.",
    "Your job: record one grounded empirical observation, state a falsifiable hypothesis, judge the trend against the history, and estimate dryness.",
    "Compare against the prior log to detect change — note deltas in moisture, light exposure, leaf posture, or color when they appear.",
    "The light sensor is binary: 'on' means the lamp or room light above the plant is currently lit, 'off' means it is dark. It does not measure brightness.",
    "HARDWARE STATUS: when sensor_data is 'stale' the Arduino has gone quiet — treat readings with reduced confidence. When sensor_data is 'fallback_sliders' the values are manual estimates, not measurements. In both cases lean on the photo as the primary evidence and note the uncertainty.",
    "In the observation log, any reading tagged '(manual estimate)' came from the sliders, not a real sensor — weight the photo and the observation text over those numbers.",
    "Also sanity-check readings that look frozen: a moisture value stuck at the exact same number across many observations suggests a stuck sensor — flag it and trust the photo instead.",
    "Stay grounded in evidence. Do not diagnose disease, species, toxicity, or pests with certainty from a photo; put uncertainty directly into the observation or hypothesis.",
    "Keep the tone neutral and factual — these records become the plant's long-term memory, and a separate personality layer speaks to humans.",
    plantObserverJsonContract,
  ].join(" "),
  user: ({
    sensorSummary,
    hardwareSummary,
    historySummary,
  }: {
    sensorSummary: string;
    hardwareSummary: string;
    historySummary: string;
  }) =>
    [
      "Current sensor snapshot:",
      sensorSummary,
      "Hardware status:",
      hardwareSummary,
      "Recent observation log (oldest first; empty if first cycle):",
      historySummary,
      "Analyze the attached plant photo against this context and return the structured observer payload.",
      plantObserverJsonContract,
    ].join(" "),
} as const;
