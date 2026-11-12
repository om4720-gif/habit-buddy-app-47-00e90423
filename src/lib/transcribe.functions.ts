import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getFallbackAI } from "@/lib/ai-fallback.server";
import { DAY, MINUTE, limitUser } from "@/lib/rate-limit.server";

const PROMPT =
  "Transcribe this audio exactly as spoken. The speaker may use Egyptian Arabic, English, or a mix of both. " +
  "Write Arabic words in Arabic script and English words (course names, 'lecture', 'tutorial', 'assignment') in English. " +
  "Output only the transcript, with no commentary and no quotation marks. If there is no speech, output nothing.";

/**
 * Cloud transcription spends the app owner's AI key, so only accounts listed in the
 * VOICE_ALLOWED_EMAILS secret (comma-separated) may use it. With no list set, nobody can.
 * Everyone else falls back to the device's built-in speech recognition.
 */
function canUseCloudVoice(claims: { email?: unknown }): boolean {
  const allowed = (process.env["VOICE_ALLOWED_EMAILS"] ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const email = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";
  return email !== "" && allowed.includes(email);
}

/** Tells the client whether cloud transcription (Gemini, via the free key) is available to this user. */
export const getVoiceEngine = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => ({
    cloud: getFallbackAI() !== null && canUseCloudVoice(context.claims),
  }));

export const transcribeAudio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) =>
    z
      .object({
        // ~28M base64 chars is about 20 MB of audio; reject bigger payloads early.
        audioBase64: z
          .string()
          .min(100)
          .max(28_000_000)
          .refine((v) => /^[A-Za-z0-9+/]{100}/.test(v), "That doesn't look like audio."),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    if (!canUseCloudVoice(context.claims)) {
      throw new Error("Cloud voice is not enabled for this account.");
    }
    // Every recording is a paid or quota-limited AI call: limit it per person.
    limitUser(context.userId, "voice", [
      { limit: 10, windowMs: MINUTE, label: "voice" },
      { limit: 150, windowMs: DAY, label: "daily voice" },
    ]);
    const fb = getFallbackAI();
    if (!fb) throw new Error("Cloud voice isn't set up. Add the FALLBACK_AI_API_KEY secret.");

    const res = await fetch(`${fb.baseURL.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${fb.apiKey}` },
      body: JSON.stringify({
        model: process.env["FALLBACK_AI_TRANSCRIBE_MODEL"] ?? fb.model,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: PROMPT },
              { type: "input_audio", input_audio: { data: data.audioBase64, format: "wav" } },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`Transcription failed [${res.status}]: ${body.slice(0, 500)}`);
      if (res.status === 429) throw new Error("Too many voice requests. Try again in a minute.");
      if (res.status === 400 || res.status === 404)
        throw new Error(
          "The voice model rejected the request. Check FALLBACK_AI_MODEL in your secrets.",
        );
      if (res.status === 401 || res.status === 403)
        throw new Error("The voice key was refused. Check FALLBACK_AI_API_KEY in your secrets.");
      throw new Error("Could not understand that recording.");
    }

    const json = (await res.json()) as { choices?: { message?: { content?: unknown } }[] };
    const content = json.choices?.[0]?.message?.content;
    const text = typeof content === "string" ? content : "";
    return { text: text.trim().replace(/^["“”']+|["“”']+$/g, "") };
  });
