"use client";

import { ChangeEvent, DragEvent, useEffect, useMemo, useState } from "react";

type AnalyzeResponse = {
  analysis: string;
};

type ScanMode = "quick" | "personal";

type SkinProfile = {
  skinType: "oily" | "dry" | "combination" | "sensitive";
  mainConcern:
    | "acne"
    | "pigmentation"
    | "redness"
    | "dehydration"
    | "barrier damage";
  sensitivityLevel: "low" | "medium" | "high";
  ingredientsToAvoid: string;
};

type QuickAnalysis = {
  matchPercent: string;
  status: string;
  goodIngredients: string[];
  riskyIngredients: string[];
  acneWarning: string[];
  fragranceWarning: string[];
  drynessWarning: string[];
  verdict: string;
};

type PersonalAnalysis = {
  profileBadges: string[];
  compatibilitySummary: string;
  compatibilityPercent: string;
  matchReasons: string[];
  conflictReasons: string[];
  carefulIngredients: string[];
  usageRecommendation: string[];
  finalVerdict: string[];
};

const scanModes = [
  {
    id: "quick",
    title: "Quick Scan",
    eyebrow: "Instant check",
    description: "Fast ingredient safety scan with no profile required.",
  },
  {
    id: "personal",
    title: "Personal Scan",
    eyebrow: "Deeper match",
    description: "Personalized reasoning for your skin and sensitivities.",
  },
] as const;

const loadingTips = [
  "Fragrance is one of the most common skincare irritants.",
  "Barrier-support ingredients help sensitive skin feel calmer.",
  "Non-comedogenic formulas are less likely to clog pores.",
  "Clear ingredient photos make scans more accurate.",
];

const exampleScans = ["Daily SPF", "Vitamin C serum", "Barrier moisturizer"];
const trustIndicators = [
  "No sign-in required",
  "Image-only scan",
  "Visible ingredients only",
];

const quickFields = {
  matchPercent: "MATCH_PERCENT:",
  status: "STATUS:",
  goodIngredients: "GOOD_INGREDIENTS:",
  riskyIngredients: "RISKY_INGREDIENTS:",
  acneWarning: "ACNE_TRIGGER_WARNING:",
  fragranceWarning: "FRAGRANCE_WARNING:",
  drynessWarning: "DRYNESS_WARNING:",
  verdict: "ONE_LINE_VERDICT:",
} as const;

const personalFields = {
  profileBadges: "PROFILE_BADGES:",
  compatibilitySummary: "COMPATIBILITY_SUMMARY:",
  compatibilityPercent: "COMPATIBILITY_PERCENT:",
  matchReasons: "WHY_IT_MATCHES:",
  conflictReasons: "WHY_IT_CONFLICTS:",
  carefulIngredients: "INGREDIENTS_TO_BE_CAREFUL_ABOUT:",
  usageRecommendation: "USAGE_RECOMMENDATION:",
  finalVerdict: "FINAL_VERDICT:",
} as const;

export default function Home() {
  const [scanMode, setScanMode] = useState<ScanMode>("quick");
  const [skinProfile, setSkinProfile] = useState<SkinProfile>({
    skinType: "oily",
    mainConcern: "acne",
    sensitivityLevel: "medium",
    ingredientsToAvoid: "",
  });
  const [imageBase64, setImageBase64] = useState<string>("");
  const [imageMimeType, setImageMimeType] = useState<string>("");
  const [imagePreview, setImagePreview] = useState<string>("");
  const [analysis, setAnalysis] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [tipIndex, setTipIndex] = useState<number>(0);

  const quickAnalysis = useMemo(
    () => parseQuickAnalysis(analysis),
    [analysis],
  );
  const personalAnalysis = useMemo(
    () => parsePersonalAnalysis(analysis, skinProfile),
    [analysis, skinProfile],
  );

  useEffect(() => {
    if (!isLoading) {
      setTipIndex(0);
      return;
    }

    const intervalId = window.setInterval(() => {
      setTipIndex((currentIndex) => (currentIndex + 1) % loadingTips.length);
    }, 2200);

    return () => window.clearInterval(intervalId);
  }, [isLoading]);

  function resetScanState() {
    setAnalysis("");
    setError("");
  }

  function handleFile(file: File | undefined) {
    resetScanState();
    setImageBase64("");
    setImageMimeType("");
    setImagePreview("");

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setError("Please upload a skincare product image.");
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      const result = reader.result;

      if (typeof result !== "string") {
        setError("We could not read that image. Please try another one.");
        return;
      }

      const [, base64Data] = result.split(",");

      if (!base64Data) {
        setError("We could not prepare that image for analysis.");
        return;
      }

      setImagePreview(result);
      setImageBase64(base64Data);
      setImageMimeType(file.type);
    };

    reader.onerror = () => {
      setError("Something went wrong while reading the image.");
    };

    reader.readAsDataURL(file);
  }

  function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    handleFile(event.target.files?.[0]);
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    handleFile(event.dataTransfer.files?.[0]);
  }

  function updateProfile<Field extends keyof SkinProfile>(
    field: Field,
    value: SkinProfile[Field],
  ) {
    setSkinProfile((currentProfile) => ({
      ...currentProfile,
      [field]: value,
    }));
  }

  function handleModeChange(mode: ScanMode) {
    setScanMode(mode);
    resetScanState();
  }

  async function handleAnalyze() {
    if (!imageBase64) {
      setError("Upload a clear product or ingredient photo first.");
      return;
    }

    setIsLoading(true);
    resetScanState();

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          image: imageBase64,
          mimeType: imageMimeType,
          mode: scanMode,
          profile: scanMode === "personal" ? skinProfile : undefined,
        }),
      });

      const data = (await response.json()) as Partial<AnalyzeResponse>;

      if (!response.ok) {
        throw new Error(data.analysis ?? "The scan could not be completed.");
      }

      if (typeof data.analysis !== "string" || data.analysis.trim() === "") {
        throw new Error("The scan came back empty. Please try again.");
      }

      setAnalysis(data.analysis);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "AI service is temporarily busy. Try again in a moment.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f8f4ec] px-4 py-6 text-stone-950 sm:px-6 sm:py-10">
      <section className="mx-auto w-full max-w-4xl">
        <header className="pt-5 text-center sm:pt-10">
          <div className="mx-auto inline-flex rounded-full border border-stone-200 bg-white/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-stone-500 shadow-sm">
            Powered by AI ingredient analysis
          </div>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
            Before you buy, ask DermaMind.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-stone-600 sm:text-lg">
            Scan skincare ingredients instantly and know if a product matches
            your skin.
          </p>
          <div className="mx-auto mt-5 flex max-w-xl flex-wrap justify-center gap-2">
            {trustIndicators.map((item) => (
              <span
                className="rounded-full border border-stone-200 bg-white/70 px-3 py-1.5 text-xs font-medium text-stone-600"
                key={item}
              >
                {item}
              </span>
            ))}
          </div>
        </header>

        <div className="mt-9 grid gap-4 sm:grid-cols-2">
          {scanModes.map((mode) => {
            const isActive = scanMode === mode.id;

            return (
              <button
                className={`min-h-44 rounded-[2rem] border p-5 text-left shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-xl ${
                  isActive
                    ? "border-stone-900 bg-white shadow-stone-300/60 ring-4 ring-white"
                    : "border-white/80 bg-white/70 shadow-stone-200/60"
                }`}
                key={mode.id}
                onClick={() => handleModeChange(mode.id)}
                type="button"
              >
                <div className="flex items-start justify-between gap-4">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-stone-50 text-lg font-semibold shadow-inner">
                    {mode.id === "quick" ? "QS" : "PS"}
                  </span>
                  <span
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                      isActive
                        ? "bg-stone-950 text-white"
                        : "bg-stone-100 text-stone-600"
                    }`}
                  >
                    {isActive ? "Active" : "Tap"}
                  </span>
                </div>
                <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                  {mode.eyebrow}
                </p>
                <h2 className="mt-2 text-2xl font-semibold">{mode.title}</h2>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  {mode.description}
                </p>
              </button>
            );
          })}
        </div>

        <div className="mt-5 rounded-[2rem] border border-white/90 bg-white/85 p-4 shadow-2xl shadow-stone-200/70 backdrop-blur sm:p-7">
          {scanMode === "personal" ? (
            <ProfileForm
              profile={skinProfile}
              onUpdateProfile={updateProfile}
            />
          ) : null}

          <section className={scanMode === "personal" ? "mt-5" : ""}>
            <UploadArea
              imagePreview={imagePreview}
              isDragging={isDragging}
              isLoading={isLoading}
              onDragEnter={() => setIsDragging(true)}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onImageChange={handleImageChange}
            />

            <button
              className="mt-5 flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl bg-stone-950 px-5 py-4 text-sm font-semibold text-white shadow-lg shadow-stone-300/60 transition hover:-translate-y-0.5 hover:bg-stone-800 disabled:translate-y-0 disabled:cursor-not-allowed disabled:bg-stone-400 disabled:shadow-none"
              disabled={!imageBase64 || isLoading}
              onClick={handleAnalyze}
              type="button"
            >
              {isLoading ? (
                <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
              ) : null}
              {isLoading
                ? "Scanning ingredients..."
                : scanMode === "quick"
                  ? "Run Quick Scan"
                  : "Run Personal Scan"}
            </button>

            {isLoading ? (
              <LoadingCard mode={scanMode} tip={loadingTips[tipIndex]} />
            ) : null}

            {error ? (
              <ErrorCard message={error} onRetry={handleAnalyze} />
            ) : null}

            {!isLoading && analysis && scanMode === "quick" ? (
              <QuickResultCard analysis={quickAnalysis} />
            ) : null}

            {!isLoading && analysis && scanMode === "personal" ? (
              <PersonalResultCard analysis={personalAnalysis} />
            ) : null}
          </section>
        </div>

        <section className="mt-7 rounded-[2rem] border border-white/80 bg-white/55 p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
            Example scans
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {exampleScans.map((scan) => (
              <div
                className="rounded-2xl border border-stone-200 bg-white/70 p-4 text-sm font-medium text-stone-700"
                key={scan}
              >
                {scan}
              </div>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}

function ProfileForm({
  profile,
  onUpdateProfile,
}: {
  profile: SkinProfile;
  onUpdateProfile: <Field extends keyof SkinProfile>(
    field: Field,
    value: SkinProfile[Field],
  ) => void;
}) {
  return (
    <section className="rounded-[1.75rem] border border-stone-200 bg-stone-50/80 p-4 sm:p-5">
      <div>
        <h2 className="text-lg font-semibold">Your skin profile</h2>
        <p className="mt-1 text-sm leading-6 text-stone-600">
          Used only for this scan. No account needed.
        </p>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <ProfileSelect
          label="Skin type"
          value={profile.skinType}
          onChange={(value) =>
            onUpdateProfile("skinType", value as SkinProfile["skinType"])
          }
          options={["oily", "dry", "combination", "sensitive"]}
        />
        <ProfileSelect
          label="Main concern"
          value={profile.mainConcern}
          onChange={(value) =>
            onUpdateProfile("mainConcern", value as SkinProfile["mainConcern"])
          }
          options={[
            "acne",
            "pigmentation",
            "redness",
            "dehydration",
            "barrier damage",
          ]}
        />
        <ProfileSelect
          label="Sensitivity"
          value={profile.sensitivityLevel}
          onChange={(value) =>
            onUpdateProfile(
              "sensitivityLevel",
              value as SkinProfile["sensitivityLevel"],
            )
          }
          options={["low", "medium", "high"]}
        />
      </div>

      <label className="mt-4 block">
        <span className="mb-2 block text-sm font-medium text-stone-800">
          Ingredients to avoid
        </span>
        <input
          className="min-h-12 w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-800 shadow-sm placeholder:text-stone-400 transition focus:border-stone-500 focus:outline-none"
          type="text"
          value={profile.ingredientsToAvoid}
          onChange={(event) =>
            onUpdateProfile("ingredientsToAvoid", event.target.value)
          }
          placeholder="e.g. fragrance, alcohol, essential oils"
        />
      </label>
    </section>
  );
}

function ProfileSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-stone-800">
        {label}
      </span>
      <select
        className="min-h-12 w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm capitalize text-stone-800 shadow-sm transition focus:border-stone-500 focus:outline-none"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function UploadArea({
  imagePreview,
  isDragging,
  isLoading,
  onDragEnter,
  onDragLeave,
  onDrop,
  onImageChange,
}: {
  imagePreview: string;
  isDragging: boolean;
  isLoading: boolean;
  onDragEnter: () => void;
  onDragLeave: () => void;
  onDrop: (event: DragEvent<HTMLLabelElement>) => void;
  onImageChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <label
      className="block cursor-pointer"
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
    >
      <input
        className="sr-only"
        type="file"
        accept="image/*"
        disabled={isLoading}
        onChange={onImageChange}
      />
      <div
        className={`rounded-[1.75rem] border border-dashed p-4 text-center transition sm:p-5 ${
          isDragging
            ? "border-stone-900 bg-white"
            : "border-stone-300 bg-stone-50/80 hover:border-stone-500 hover:bg-white"
        }`}
      >
        {imagePreview ? (
          <div className="overflow-hidden rounded-[1.4rem] border border-stone-200 bg-white shadow-sm transition duration-300">
            <img
              alt="Uploaded skincare product preview"
              className="max-h-80 w-full object-contain"
              src={imagePreview}
            />
          </div>
        ) : (
          <div className="px-4 py-10">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-2xl shadow-sm transition duration-300 hover:-translate-y-1">
              <span className="block -translate-y-0.5">^</span>
            </div>
            <p className="mt-4 text-base font-semibold text-stone-950">
              Drop or upload ingredient photo
            </p>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-stone-500">
              Clear product labels and ingredient lists give the most reliable
              result.
            </p>
          </div>
        )}
      </div>
    </label>
  );
}

function LoadingCard({ mode, tip }: { mode: ScanMode; tip: string }) {
  return (
    <div className="mt-5 rounded-[1.75rem] border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-stone-950">
          <span className="h-5 w-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
        </div>
        <div>
          <p className="text-sm font-semibold text-stone-900">
            {mode === "quick"
              ? "Scanning ingredients..."
              : "Matching this product to your profile..."}
          </p>
          <p className="mt-1 text-xs leading-5 text-stone-500">{tip}</p>
        </div>
      </div>
      <div className="mt-5 space-y-3">
        <div className="h-3 w-5/6 rounded-full bg-stone-100" />
        <div className="h-3 w-full rounded-full bg-stone-100" />
        <div className="h-3 w-2/3 rounded-full bg-stone-100" />
      </div>
    </div>
  );
}

function ErrorCard({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="mt-5 rounded-[1.75rem] border border-rose-200 bg-rose-50 p-5 text-rose-950 shadow-sm">
      <p className="text-sm font-semibold">Could not analyze image clearly</p>
      <p className="mt-2 text-sm leading-6 text-rose-800">{message}</p>
      <p className="mt-2 text-sm leading-6 text-rose-700">
        Try a sharper ingredient photo, better lighting, or retry if the AI
        service is busy.
      </p>
      <button
        className="mt-4 rounded-full bg-white px-4 py-2.5 text-xs font-semibold text-rose-950 shadow-sm transition hover:bg-rose-100"
        onClick={onRetry}
        type="button"
      >
        Try again
      </button>
    </div>
  );
}

function QuickResultCard({ analysis }: { analysis: QuickAnalysis }) {
  const percent = normalizePercent(analysis.matchPercent);
  const tone = getScoreTone(percent);
  const status = normalizeStatus(analysis.status, percent);

  return (
    <article className="mt-5 rounded-[2rem] border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
      <div className={`rounded-[1.75rem] p-5 ${tone.heroClass}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-70">
              Compatibility score
            </p>
            <h2 className="mt-3 text-5xl font-semibold tracking-tight">
              {percent}/100
            </h2>
          </div>
          <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${status.className}`}>
            {status.label}
          </span>
        </div>
        <p className="mt-4 text-sm leading-6">
          {analysis.verdict || tone.defaultSummary}
        </p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <InsightCard
          colorClass="border-emerald-100 bg-emerald-50 text-emerald-950"
          title="Good ingredients"
          bullets={analysis.goodIngredients}
        />
        <InsightCard
          colorClass="border-amber-100 bg-amber-50 text-amber-950"
          title="Risky ingredients"
          bullets={analysis.riskyIngredients}
        />
        <InsightCard
          colorClass="border-rose-100 bg-rose-50 text-rose-950"
          title="Acne trigger warning"
          bullets={analysis.acneWarning}
        />
        <InsightCard
          colorClass="border-yellow-100 bg-yellow-50 text-yellow-950"
          title="Fragrance warning"
          bullets={analysis.fragranceWarning}
        />
        <InsightCard
          colorClass="border-sky-100 bg-sky-50 text-sky-950 sm:col-span-2"
          title="Dryness warning"
          bullets={analysis.drynessWarning}
        />
      </div>
    </article>
  );
}

function PersonalResultCard({ analysis }: { analysis: PersonalAnalysis }) {
  const percent = normalizePercent(analysis.compatibilityPercent);
  const tone = getScoreTone(percent);

  return (
    <article className="mt-5 rounded-[2rem] border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
          Personal Scan
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {analysis.profileBadges.map((badge) => (
            <span
              className="rounded-full bg-stone-100 px-3 py-1.5 text-xs font-semibold text-stone-700"
              key={badge}
            >
              {badge}
            </span>
          ))}
        </div>
      </div>

      <div className={`mt-5 rounded-[1.75rem] p-5 ${tone.heroClass}`}>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-70">
          Personalized compatibility
        </p>
        <h2 className="mt-3 text-5xl font-semibold tracking-tight">
          {percent}/100
        </h2>
        <p className="mt-3 text-sm leading-6">
          {analysis.compatibilitySummary || tone.defaultSummary}
        </p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <InsightCard
          colorClass="border-emerald-100 bg-emerald-50 text-emerald-950"
          title="Why it matches"
          bullets={analysis.matchReasons}
        />
        <InsightCard
          colorClass="border-rose-100 bg-rose-50 text-rose-950"
          title="Why it may conflict"
          bullets={analysis.conflictReasons}
        />
        <InsightCard
          colorClass="border-amber-100 bg-amber-50 text-amber-950"
          title="Ingredients to be careful about"
          bullets={analysis.carefulIngredients}
        />
        <InsightCard
          colorClass="border-sky-100 bg-sky-50 text-sky-950"
          title="Usage recommendation"
          bullets={analysis.usageRecommendation}
        />
      </div>

      <InsightCard
        colorClass="mt-3 border-stone-200 bg-stone-50 text-stone-950"
        title="Final verdict"
        bullets={analysis.finalVerdict}
      />
    </article>
  );
}

function InsightCard({
  colorClass,
  title,
  bullets,
}: {
  colorClass: string;
  title: string;
  bullets: string[];
}) {
  const visibleBullets =
    bullets.length > 0
      ? bullets.slice(0, 4)
      : ["Not clearly visible in the image."];

  return (
    <section className={`rounded-3xl border p-4 ${colorClass}`}>
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="mt-3 space-y-2">
        {visibleBullets.map((bullet) => (
          <li className="flex gap-2 text-sm leading-6" key={bullet}>
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-60" />
            <span>{bullet}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function parseQuickAnalysis(analysis: string): QuickAnalysis {
  return {
    matchPercent: readField(analysis, quickFields.matchPercent),
    status: readField(analysis, quickFields.status),
    goodIngredients: readBullets(analysis, quickFields.goodIngredients),
    riskyIngredients: readBullets(analysis, quickFields.riskyIngredients),
    acneWarning: readBullets(analysis, quickFields.acneWarning),
    fragranceWarning: readBullets(analysis, quickFields.fragranceWarning),
    drynessWarning: readBullets(analysis, quickFields.drynessWarning),
    verdict: readField(analysis, quickFields.verdict),
  };
}

function parsePersonalAnalysis(
  analysis: string,
  profile: SkinProfile,
): PersonalAnalysis {
  const fallbackBadges = [
    toTitleCase(profile.skinType),
    toTitleCase(profile.mainConcern),
    `${toTitleCase(profile.sensitivityLevel)} Sensitivity`,
    profile.ingredientsToAvoid
      ? `Avoiding ${profile.ingredientsToAvoid}`
      : "No avoid list",
  ];
  const parsedBadges = readList(analysis, personalFields.profileBadges);

  return {
    profileBadges: parsedBadges.length > 0 ? parsedBadges : fallbackBadges,
    compatibilitySummary: readField(
      analysis,
      personalFields.compatibilitySummary,
    ),
    compatibilityPercent: readField(
      analysis,
      personalFields.compatibilityPercent,
    ),
    matchReasons: readBullets(analysis, personalFields.matchReasons),
    conflictReasons: readBullets(analysis, personalFields.conflictReasons),
    carefulIngredients: readBullets(analysis, personalFields.carefulIngredients),
    usageRecommendation: readBullets(
      analysis,
      personalFields.usageRecommendation,
    ),
    finalVerdict: readBullets(analysis, personalFields.finalVerdict),
  };
}

function readField(analysis: string, marker: string): string {
  const markers = [...Object.values(quickFields), ...Object.values(personalFields)];
  const startIndex = analysis.indexOf(marker);

  if (startIndex === -1) {
    return "";
  }

  const valueStart = startIndex + marker.length;
  const nextMarkerIndex = markers
    .map((nextMarker) => analysis.indexOf(nextMarker, valueStart))
    .filter((index) => index !== -1)
    .sort((firstIndex, secondIndex) => firstIndex - secondIndex)[0];

  return analysis
    .slice(valueStart, nextMarkerIndex === undefined ? undefined : nextMarkerIndex)
    .trim();
}

function readBullets(analysis: string, marker: string): string[] {
  return readField(analysis, marker)
    .split("\n")
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 4);
}

function readList(analysis: string, marker: string): string[] {
  return readField(analysis, marker)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 5);
}

function normalizePercent(value: string): number {
  const number = Number.parseInt(value.replace(/[^0-9]/g, ""), 10);

  if (Number.isNaN(number)) {
    return 70;
  }

  return Math.min(100, Math.max(0, number));
}

function normalizeStatus(status: string, percent: number) {
  const upperStatus = status.toUpperCase();

  if (upperStatus.includes("AVOID") || percent < 55) {
    return {
      label: "AVOID",
      className: "bg-rose-100 text-rose-900",
    };
  }

  if (upperStatus.includes("CAUTION") || percent < 80) {
    return {
      label: "CAUTION",
      className: "bg-amber-100 text-amber-900",
    };
  }

  return {
    label: "SAFE",
    className: "bg-emerald-100 text-emerald-900",
  };
}

function getScoreTone(percent: number) {
  if (percent >= 80) {
    return {
      heroClass: "bg-emerald-50 text-emerald-950",
      defaultSummary: "Looks like a strong match from what is visible.",
    };
  }

  if (percent >= 60) {
    return {
      heroClass: "bg-amber-50 text-amber-950",
      defaultSummary: "Potentially workable, but a few details deserve care.",
    };
  }

  return {
    heroClass: "bg-rose-50 text-rose-950",
    defaultSummary: "Not the most comfortable match based on what is visible.",
  };
}

function toTitleCase(value: string): string {
  return value
    .split(" ")
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}
