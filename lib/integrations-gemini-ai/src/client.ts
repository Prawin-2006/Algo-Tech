import { GoogleGenAI } from "@google/genai";

function resolveGeminiApiKey(): string | null {
  const value =
    process.env.GEMINI_API_KEY ??
    process.env.AI_INTEGRATIONS_GEMINI_API_KEY ??
    null;

  if (!value || value.trim() === "") {
    return null;
  }

  return value.trim();
}

function resolveGeminiBaseUrl(): string | null {
  const value =
    process.env.GEMINI_BASE_URL ??
    process.env.AI_INTEGRATIONS_GEMINI_BASE_URL ??
    null;

  if (!value || value.trim() === "") {
    return null;
  }

  return value.trim();
}

const apiKey = resolveGeminiApiKey();
const baseUrl = resolveGeminiBaseUrl();

export const ai = apiKey
  ? new GoogleGenAI({
      apiKey,
      ...(baseUrl
        ? {
            httpOptions: {
              baseUrl,
            },
          }
        : {}),
    })
  : null;
