// Ephemeral token minting for the Realtime API.
//
// The browser must never see the real OPENAI_API_KEY. Instead it asks this
// endpoint for a short-lived client secret ("ek_..."), which it then uses to
// authenticate the WebRTC connection directly with OpenAI. The session
// configuration — model, voice, the plant's personality, and its tools — is
// attached to the secret here, server-side, so the client can't change it.

import type { Request, Response } from "express";
import { ensureApiKey, getOpenAI } from "./openai";
import {
  CLIENT_SECRET_TTL_SECONDS,
  PLANT_INSTRUCTIONS,
  PLANT_TOOLS,
  REALTIME_MODEL,
  resolvePlantVoice,
} from "../src/lib/plant/realtime-config";

export async function handleRealtimeTokenRequest(req: Request, res: Response) {
  if (!ensureApiKey(res)) return;

  // The browser may request a voice; resolvePlantVoice validates it against the
  // allowed list (falling back to the default), so the client can't inject
  // arbitrary session config.
  const voice = resolvePlantVoice(req.body?.voice);

  try {
    const secret = await getOpenAI().realtime.clientSecrets.create(
      {
        expires_after: {
          anchor: "created_at",
          seconds: CLIENT_SECRET_TTL_SECONDS,
        },
        session: {
          type: "realtime",
          model: REALTIME_MODEL,
          instructions: PLANT_INSTRUCTIONS,
          tools: [...PLANT_TOOLS],
          tool_choice: "auto",
          audio: {
            input: {
              // Transcribe the visitor's speech so the dashboard can show both
              // sides of the conversation.
              transcription: { model: "gpt-4o-mini-transcribe" },
              // Semantic VAD ends the user's turn based on what they said, not
              // just silence — much more natural for conversation.
              turn_detection: { type: "semantic_vad" },
            },
            output: { voice },
          },
        },
      },
      // Minting a token should be near-instant; fail fast instead of inheriting
      // the SDK's 10-minute default timeout. A hung mint must not stack up and
      // exhaust the connection pool (which leaves every later request hanging).
      { timeout: 15_000, maxRetries: 1 },
    );

    res.json({
      clientSecret: secret.value,
      expiresAt: secret.expires_at,
      model: REALTIME_MODEL,
    });
  } catch (error) {
    console.error("Realtime client secret error:", error);
    res.status(502).json({ error: "Failed to create a Realtime session token." });
  }
}
