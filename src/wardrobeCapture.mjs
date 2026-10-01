import { normalizeWardrobeVisualAttributes } from "../supabase/functions/_shared/wardrobe-vision.js";

export const MAX_WARDROBE_PHOTO_SOURCE_BYTES = 12 * 1024 * 1024;
export const MAX_WARDROBE_PHOTO_UPLOAD_BYTES = 1_350_000;

export function validateWardrobePhotoFile(file) {
  if (!file || typeof file !== "object") return "Choose a photo to analyze.";
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    return "Choose a JPEG, PNG, or WebP photo.";
  }
  if (!Number.isFinite(file.size) || file.size <= 0) return "The selected photo is empty.";
  if (file.size > MAX_WARDROBE_PHOTO_SOURCE_BYTES) {
    return "Choose a photo smaller than 12 MB.";
  }
  return "";
}

export function applyWardrobeVisionSuggestion(draft, suggestion, touchedFields = []) {
  const touched = touchedFields instanceof Set ? touchedFields : new Set(touchedFields);
  const next = {
    ...draft,
    visualAttributes: normalizeWardrobeVisualAttributes(draft?.visualAttributes),
  };
  const assignIfUntouched = (field, value) => {
    if (!touched.has(field) && value !== "" && value !== null && value !== undefined) {
      next[field] = value;
    }
  };

  assignIfUntouched("name", suggestion.suggestedName);
  assignIfUntouched("type", suggestion.category === "uncertain" ? "" : suggestion.category);
  assignIfUntouched("tone", suggestion.colorName);
  assignIfUntouched("color", suggestion.colorHex);
  assignIfUntouched("formality", suggestion.formality);
  if (
    !touched.has("formality") &&
    Number.isInteger(suggestion.formality) &&
    [1, 2, 3].includes(suggestion.formality)
  ) {
    next.formalityExplicit = true;
    next.visualAttributes.formalityConfirmed = true;
  }
  assignIfUntouched(
    "weather",
    suggestion.weatherHint === "warm"
      ? "hot"
      : suggestion.weatherHint === "cool"
        ? "cool"
        : "",
  );
  if (!touched.has("visualAttributes.pattern") && suggestion.pattern !== "uncertain") {
    next.visualAttributes.pattern = suggestion.pattern;
  }
  if (!touched.has("visualAttributes.visibleDetails") && suggestion.visibleDetails) {
    next.visualAttributes.visibleDetails = suggestion.visibleDetails;
  }
  return next;
}

export function buildWardrobeItemRecord(draft, existingItem = null, id = `custom-${Date.now()}`) {
  const tone = typeof draft.tone === "string" && draft.tone.trim()
    ? draft.tone.trim().slice(0, 32)
    : "Unspecified";
  return {
    id: existingItem?.id || id,
    ...(existingItem?._cloudId ? { _cloudId: existingItem._cloudId } : {}),
    name: typeof draft.name === "string" ? draft.name.trim().slice(0, 100) : "",
    type: draft.type,
    tone,
    color: /^#[0-9a-fA-F]{6}$/.test(draft.color) ? draft.color.toLowerCase() : "#d4c4e8",
    icon: existingItem?.icon || "✦",
    formality: Number.isInteger(draft.formality) && [1, 2, 3].includes(draft.formality)
      ? draft.formality
      : null,
    formalityExplicit: draft.formalityExplicit === true,
    weather: ["all", "hot", "cool"].includes(draft.weather) ? draft.weather : "all",
    note: typeof draft.note === "string"
      ? draft.note.trim().slice(0, 500) || (existingItem ? "" : "Added just now")
      : existingItem ? "" : "Added just now",
    visualAttributes: normalizeWardrobeVisualAttributes({
      ...draft.visualAttributes,
      formalityConfirmed: draft.formalityExplicit === true,
    }),
  };
}

export async function prepareWardrobePhoto(file) {
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") {
    throw new Error("This browser cannot prepare the selected photo.");
  }
  const bitmap = await createImageBitmap(file);
  try {
    const initialScale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    let scale = initialScale;
    const qualities = [0.84, 0.78, 0.72, 0.66, 0.6, 0.54];
    for (const quality of qualities) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("This browser cannot prepare the selected photo.");
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (!blob) throw new Error("This browser could not read the selected photo.");
      if (blob.size <= MAX_WARDROBE_PHOTO_UPLOAD_BYTES) return blob;
      scale *= 0.84;
    }
  } finally {
    bitmap.close?.();
  }
  throw new Error("This photo is too detailed to analyze. Choose a smaller image.");
}

export async function imageBlobToBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}