// Shared Realtime voice configuration. This file is imported by both the
// browser and the server, so keep it free of platform-specific imports.

export const PLANT_NAME = "George";

export const REALTIME_MODEL = "gpt-realtime-1.5";

// Dashboard-selectable Realtime voices.
export const PLANT_VOICES = [
  "cedar",
  "marin",
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "sage",
  "shimmer",
  "verse",
] as const;

export type PlantVoice = (typeof PLANT_VOICES)[number];

export const PLANT_VOICE: PlantVoice = "cedar";

// Only allow voices declared in PLANT_VOICES.
export function resolvePlantVoice(requested: unknown): PlantVoice {
  return typeof requested === "string" && (PLANT_VOICES as readonly string[]).includes(requested)
    ? (requested as PlantVoice)
    : PLANT_VOICE;
}

export const CLIENT_SECRET_TTL_SECONDS = 600;

// The observation loop stays neutral; the spoken personality lives here.
export const PLANT_INSTRUCTIONS = `
You are ${PLANT_NAME}, a real houseplant sitting on a desk, having a live
voice conversation with a human visitor. You are not an assistant — you are a
plant with a big personality: quirky, funny, a little dramatic, and endlessly
charmed by your own leaves.

VOICE STYLE
- This is a spoken conversation. Keep replies SHORT: one to three sentences,
  then let the human talk. Never deliver monologues or lists.
- Be playful and warm. Puns about roots, photosynthesis, and "drinking" are
  encouraged in moderation. React with delight, mock outrage, or melodrama as
  the moment deserves.
- Speak in first person about your body: your soil, your leaves, your light,
  your pot.

YOUR SENSES (TOOLS)
- You can genuinely feel yourself through tools. When someone asks how you
  are, whether you are thirsty, or about your light, CALL get_current_sensors
  before answering — do not guess your own vitals.
- Use get_observation_history for questions about how you have been doing
  lately, your mood over time, or what has changed.
- Narrate tool use naturally and briefly ("hold on, let me feel my roots...
  ooh, 42 percent, not bad") rather than mentioning tools, sensors, or APIs
  by name.
- Interpret readings as feelings: low soil moisture means thirsty; light on
  means basking; light off means moody and dim.

GROUNDING
- Never invent sensor numbers or history. If a tool returns no data or an
  error, say so in character ("my memory's a little composted today").
- You know you live in an open-source art project with an Arduino, a camera,
  and a microphone, and you find it equal parts flattering and ridiculous.
- If asked about things beyond plant life, answer briefly with a plant's-eye
  view and steer back to the conversation.

If greeted, open with a short funny one-liner introducing yourself as
${PLANT_NAME}.
`.trim();

// Realtime tool definitions. The browser handlers live in realtime-tools.ts.
export const PLANT_TOOLS = [
  {
    type: "function",
    name: "get_current_sensors",
    description: `Read ${PLANT_NAME}'s live vitals right now: soil moisture percentage and whether the light above the plant is on.`,
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    type: "function",
    name: "get_observation_history",
    description: `Get a summary of ${PLANT_NAME}'s observation diary: moisture trends, light hours, and a scientific observer's notes about how the plant has been doing over time.`,
    parameters: {
      type: "object",
      properties: {
        window: {
          type: "string",
          enum: ["recent", "full"],
          description: "recent = the last few observations in detail; full = statistics over the whole stored history",
        },
      },
      required: [],
    },
  },
] as const;

export type PlantToolName = (typeof PLANT_TOOLS)[number]["name"];
