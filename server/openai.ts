// Shared OpenAI client for the server handlers.
//
// Created lazily so the server can boot (with a warning) even when
// OPENAI_API_KEY is missing — the constructor throws without a key.

import type { Response } from "express";
import OpenAI from "openai";

let openaiClient: OpenAI | null = null;

export function getOpenAI() {
  openaiClient ??= new OpenAI();
  return openaiClient;
}

export function ensureApiKey(res: Response) {
  if (!process.env.OPENAI_API_KEY) {
    res.status(500).json({ error: "OPENAI_API_KEY not configured" });
    return false;
  }
  return true;
}
