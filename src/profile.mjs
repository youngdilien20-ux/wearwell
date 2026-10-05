export const EMPTY_PROFILE_DETAILS = Object.freeze({
  country: "",
  countryOther: "",
  region: "",
  city: "",
  skinTone: "",
  fitPreference: "",
  heightCm: "",
  hairProfile: "",
  communityContext: "",
});

export const SKIN_TONE_OPTIONS = [
  { value: "light", label: "Light", color: "#f3dfd0" },
  { value: "light-medium", label: "Light–medium", color: "#dfb99c" },
  { value: "medium", label: "Medium", color: "#c68d68" },
  { value: "medium-deep", label: "Medium–deep", color: "#986044" },
  { value: "deep", label: "Deep", color: "#633c2d" },
];

export const FIT_PREFERENCE_OPTIONS = [
  { value: "more-room", label: "More room", detail: "Ease and space" },
  { value: "balanced", label: "Balanced", detail: "Neither close nor loose" },
  { value: "closer-fit", label: "Closer fit", detail: "A neater feel" },
  { value: "varies", label: "It varies", detail: "Depends on the garment" },
];

const SKIN_TONE_VALUES = new Set(SKIN_TONE_OPTIONS.map(({ value }) => value));
const FIT_PREFERENCE_VALUES = new Set(FIT_PREFERENCE_OPTIONS.map(({ value }) => value));

function boundedText(value, limit) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

export function normalizeProfileDetails(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const rawHeight = typeof source.heightCm === "number"
    ? String(source.heightCm)
    : boundedText(source.heightCm, 3);
  const heightValue = /^\d{1,3}$/.test(rawHeight) ? Number(rawHeight) : null;

  return {
    country: boundedText(source.country, 80),
    countryOther: boundedText(source.countryOther, 80),
    region: boundedText(source.region, 80),
    city: boundedText(source.city, 80),
    skinTone: SKIN_TONE_VALUES.has(source.skinTone) ? source.skinTone : "",
    fitPreference: FIT_PREFERENCE_VALUES.has(source.fitPreference) ? source.fitPreference : "",
    heightCm: heightValue !== null && heightValue >= 100 && heightValue <= 230
      ? String(heightValue)
      : "",
    hairProfile: boundedText(source.hairProfile, 120),
    communityContext: boundedText(source.communityContext, 500),
  };
}

export function profileDetailsForAssistant(value) {
  const profile = normalizeProfileDetails(value);
  const skinTone = SKIN_TONE_OPTIONS.find(({ value: optionValue }) => optionValue === profile.skinTone)?.label || "";
  const fitPreference = FIT_PREFERENCE_OPTIONS.find(({ value: optionValue }) => optionValue === profile.fitPreference)?.label || "";

  return Object.fromEntries(
    Object.entries({
      city: profile.city,
      skinTone,
      fitPreference,
      heightCm: profile.heightCm ? `${profile.heightCm} cm` : "",
      hairProfile: profile.hairProfile,
      communityContext: profile.communityContext,
    }).filter(([, detail]) => detail),
  );
}