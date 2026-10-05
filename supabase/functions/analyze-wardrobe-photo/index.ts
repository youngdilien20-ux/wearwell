import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { runWardrobeVisionAnalysis } from "../_shared/wardrobe-vision.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const MAX_REQUEST_BYTES = 1_900_000;
const MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash";
const RATE_LIMITS = new Map<string, { windowStartedAt: number; requests: number }>();
const RATE_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_MINUTE = 6;

function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extraHeaders },
  });
}

function authenticatedUserId(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.match(/^Bearer\s+([^\s]+)$/i)?.[1];
  if (!token) return null;
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")));
    return typeof decoded.sub === "string" && decoded.sub.length <= 128 ? decoded.sub : null;
  } catch {
    return null;
  }
}

function consumeRateLimit(userId: string) {
  const now = Date.now();
  const bucket = RATE_LIMITS.get(userId);
  if (!bucket || now - bucket.windowStartedAt >= RATE_WINDOW_MS) {
    if (!bucket && RATE_LIMITS.size >= 5000) {
      const oldestUserId = RATE_LIMITS.keys().next().value;
      if (oldestUserId) RATE_LIMITS.delete(oldestUserId);
    }
    RATE_LIMITS.set(userId, { windowStartedAt: now, requests: 1 });
    return { allowed: true, retryAfter: 0 };
  }
  if (bucket.requests >= MAX_REQUESTS_PER_MINUTE) {
    return {
      allowed: false,
      retryAfter: Math.max(1, Math.ceil((RATE_WINDOW_MS - (now - bucket.windowStartedAt)) / 1000)),
    };
  }
  bucket.requests += 1;
  return { allowed: true, retryAfter: 0 };
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Only POST is supported." }, 405);

  const userId = authenticatedUserId(request);
  if (!userId) return json({ error: "Sign in to analyze a wardrobe photo." }, 401);
  const rateLimit = consumeRateLimit(userId);
  if (!rateLimit.allowed) {
    return json(
      { error: "Too many photo analyses. Please wait before trying again." },
      429,
      { "Retry-After": String(rateLimit.retryAfter) },
    );
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_REQUEST_BYTES) return json({ error: "The photo request is too large." }, 413);

  try {
    const rawBody = await request.text();
    if (rawBody.length > MAX_REQUEST_BYTES) return json({ error: "The photo request is too large." }, 413);
    const input = JSON.parse(rawBody);
    if (
      input === null ||
      typeof input !== "object" ||
      Array.isArray(input) ||
      Object.keys(input).some((key) => !["mimeType", "imageBase64"].includes(key)) ||
      typeof input.mimeType !== "string" ||
      typeof input.imageBase64 !== "string"
    ) return json({ error: "Invalid wardrobe photo request." }, 400);

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return json({ error: "Wardrobe photo analysis is not configured." }, 503);
    const result = await runWardrobeVisionAnalysis({
      mimeType: input.mimeType,
      imageBase64: input.imageBase64,
      apiKey,
      model: MODEL,
    });
    return json({ result });
  } catch (error) {
    console.error(
      "analyze-wardrobe-photo: request failed",
      error instanceof Error ? error.name : "unknown error",
    );
    const message = error instanceof Error ? error.message : "";
    if (message.startsWith("Choose ") || message.startsWith("Image data") || message.startsWith("The image")) {
      return json({ error: message }, 400);
    }
    return json({ error: "Photo analysis is temporarily unavailable. You can enter the details manually." }, 502);
  }
});