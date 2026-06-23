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

export function isApiKeyConfigured() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  return Boolean(apiKey && apiKey !== "replace-me");
}

export function ensureApiKey(res: Response) {
  if (!isApiKeyConfigured()) {
    res.status(500).json({
      error:
        "OpenAI setup is not complete yet. Ask Codex to finish Plant Talk setup, then try this again.",
    });
    return false;
  }
  return true;
}
