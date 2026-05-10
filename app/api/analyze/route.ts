import { NextResponse } from "next/server";

type AnalyzeRequest = {
  image?: unknown;
  mimeType?: unknown;
  mode?: unknown;
  profile?: unknown;
};

type AnalyzeResponse = {
  analysis: string;
};

type ScanMode = "quick" | "personal";

type SkinProfile = {
  skinType: string;
  mainConcern: string;
  sensitivityLevel: string;
  ingredientsToAvoid: string;
};

type OpenRouterResponse = {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
  error?: {
    message?: string;
  };
};

const model = "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free";
const maxAttempts = 2;
const requestTimeoutMs = 25000;

const sharedSystemPrompt = `You are DermaMind, a premium consumer skincare compatibility assistant.

Sound calm, confident, practical, and trustworthy. Write like a smart skincare friend who helps people make faster product decisions.

Important rules:
* Only discuss ingredients that are visible or readable in the image.
* If the image is unclear, say so and keep the recommendation conservative.
* Do not invent ingredients.
* Do not dump long paragraphs.
* Avoid repetitive, generic, overly cautious, robotic, or clinical wording.
* Keep each bullet short, specific, and consumer-friendly.`;

const quickScanPrompt = `${sharedSystemPrompt}

You are running Quick Scan. No profile is required.
Judge visible/readable ingredients for broad skincare compatibility and common risks like acne, fragrance irritation, and dryness.

Return exactly this plain text structure:

MATCH_PERCENT: [0-100]
STATUS: [SAFE or CAUTION or AVOID]
GOOD_INGREDIENTS:
- [short bullet]
- [short bullet]
RISKY_INGREDIENTS:
- [short bullet]
- [short bullet]
ACNE_TRIGGER_WARNING:
- [short bullet]
FRAGRANCE_WARNING:
- [short bullet]
DRYNESS_WARNING:
- [short bullet]
ONE_LINE_VERDICT: [one concise sentence]`;

const personalScanPrompt = `${sharedSystemPrompt}

You are running Personal Scan.
Personalize the reasoning to the user's skin type, main concern, sensitivity level, and ingredients they want to avoid.

Return exactly this plain text structure:

PROFILE_BADGES: [badge], [badge], [badge], [badge]
COMPATIBILITY_SUMMARY: [one short personalized sentence]
COMPATIBILITY_PERCENT: [0-100]
WHY_IT_MATCHES:
- [short bullet]
- [short bullet]
WHY_IT_CONFLICTS:
- [short bullet]
- [short bullet]
INGREDIENTS_TO_BE_CAREFUL_ABOUT:
- [short bullet]
- [short bullet]
USAGE_RECOMMENDATION:
- [short bullet]
- [short bullet]
FINAL_VERDICT:
- [short bullet]
- [short bullet]`;

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      return errorResponse("AI service is not configured yet.", 500);
    }

    const body = (await request.json()) as AnalyzeRequest;

    if (typeof body.image !== "string" || body.image.length === 0) {
      return errorResponse("Try a clearer ingredient photo before scanning.", 400);
    }

    const mimeType =
      typeof body.mimeType === "string" && body.mimeType.startsWith("image/")
        ? body.mimeType
        : "image/jpeg";
    const mode: ScanMode = body.mode === "personal" ? "personal" : "quick";
    const profile = parseProfile(body.profile);
    const analysis = await analyzeWithRetry({
      apiKey,
      image: body.image,
      mimeType,
      mode,
      profile,
    });

    return NextResponse.json({ analysis } satisfies AnalyzeResponse);
  } catch (error) {
    const message =
      error instanceof Error
        ? sanitizeErrorMessage(error.message)
        : "AI service is temporarily busy. Try again in a moment.";

    return errorResponse(message, 500);
  }
}

async function analyzeWithRetry({
  apiKey,
  image,
  mimeType,
  mode,
  profile,
}: {
  apiKey: string;
  image: string;
  mimeType: string;
  mode: ScanMode;
  profile: SkinProfile;
}) {
  let lastError = "Could not analyze image clearly. Try a sharper ingredient photo.";

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const analysis = await requestAnalysis({
        apiKey,
        image,
        mimeType,
        mode,
        profile,
      });

      if (isValidAnalysis(analysis, mode)) {
        return analysis;
      }

      lastError =
        attempt === 1
          ? "The scan came back incomplete, so DermaMind retried it."
          : "Could not analyze image clearly. Try a sharper ingredient photo.";
    } catch (error) {
      lastError =
        error instanceof Error
          ? sanitizeErrorMessage(error.message)
          : "AI service is temporarily busy. Try again in a moment.";
    }
  }

  throw new Error(lastError);
}

async function requestAnalysis({
  apiKey,
  image,
  mimeType,
  mode,
  profile,
}: {
  apiKey: string;
  image: string;
  mimeType: string;
  mode: ScanMode;
  profile: SkinProfile;
}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const openRouterResponse = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content: mode === "personal" ? personalScanPrompt : quickScanPrompt,
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: buildUserPrompt(mode, profile),
                },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:${mimeType};base64,${image}`,
                  },
                },
              ],
            },
          ],
        }),
        signal: controller.signal,
      },
    );

    const data = (await openRouterResponse.json()) as OpenRouterResponse;

    if (!openRouterResponse.ok) {
      throw new Error(
        data.error?.message ?? "AI service is temporarily busy. Try again soon.",
      );
    }

    return parseOpenRouterContent(data.choices?.[0]?.message?.content);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("AI service is taking too long. Please try again.");
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildUserPrompt(mode: ScanMode, profile: SkinProfile): string {
  if (mode === "quick") {
    return "Scan this skincare product image. Use only visible/readable ingredients. If the image is unclear, say so and keep the verdict conservative.";
  }

  return `User skin profile:
- Skin type: ${profile.skinType}
- Main concern: ${profile.mainConcern}
- Sensitivity level: ${profile.sensitivityLevel}
- Ingredients to avoid: ${profile.ingredientsToAvoid || "none shared"}

Scan this product for this exact person. Use only visible/readable ingredients. If the image is unclear, say so and keep the recommendation conservative.`;
}

function isValidAnalysis(analysis: string, mode: ScanMode): boolean {
  if (analysis.length < 40) {
    return false;
  }

  const requiredMarkers =
    mode === "quick"
      ? [
          "MATCH_PERCENT:",
          "STATUS:",
          "GOOD_INGREDIENTS:",
          "RISKY_INGREDIENTS:",
          "ACNE_TRIGGER_WARNING:",
          "FRAGRANCE_WARNING:",
          "DRYNESS_WARNING:",
          "ONE_LINE_VERDICT:",
        ]
      : [
          "PROFILE_BADGES:",
          "COMPATIBILITY_SUMMARY:",
          "COMPATIBILITY_PERCENT:",
          "WHY_IT_MATCHES:",
          "WHY_IT_CONFLICTS:",
          "INGREDIENTS_TO_BE_CAREFUL_ABOUT:",
          "USAGE_RECOMMENDATION:",
          "FINAL_VERDICT:",
        ];

  return requiredMarkers.every((marker) => analysis.includes(marker));
}

function sanitizeErrorMessage(message: string): string {
  const normalizedMessage = message.toLowerCase();

  if (
    normalizedMessage.includes("timeout") ||
    normalizedMessage.includes("taking too long")
  ) {
    return "AI service is taking too long. Please try again.";
  }

  if (
    normalizedMessage.includes("rate") ||
    normalizedMessage.includes("busy") ||
    normalizedMessage.includes("429")
  ) {
    return "AI service is temporarily busy. Try again in a moment.";
  }

  if (
    normalizedMessage.includes("image") ||
    normalizedMessage.includes("incomplete") ||
    normalizedMessage.includes("empty")
  ) {
    return "Could not analyze image clearly. Try a sharper ingredient photo.";
  }

  return "AI service is temporarily busy. Try again in a moment.";
}

function errorResponse(message: string, status: number) {
  return NextResponse.json({ analysis: message } satisfies AnalyzeResponse, {
    status,
  });
}

function parseProfile(profile: unknown): SkinProfile {
  if (!profile || typeof profile !== "object") {
    return {
      skinType: "oily",
      mainConcern: "acne",
      sensitivityLevel: "medium",
      ingredientsToAvoid: "",
    };
  }

  const profileRecord = profile as Record<string, unknown>;

  return {
    skinType: readProfileField(profileRecord.skinType, "oily"),
    mainConcern: readProfileField(profileRecord.mainConcern, "acne"),
    sensitivityLevel: readProfileField(profileRecord.sensitivityLevel, "medium"),
    ingredientsToAvoid: readProfileField(profileRecord.ingredientsToAvoid, ""),
  };
}

function readProfileField(value: unknown, fallback: string): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function parseOpenRouterContent(content: unknown): string {
  if (typeof content === "string") {
    return content.trim();
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((part) => {
      if (
        part &&
        typeof part === "object" &&
        "text" in part &&
        typeof part.text === "string"
      ) {
        return part.text;
      }

      return "";
    })
    .join("")
    .trim();
}
