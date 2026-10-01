import { normalizeProfileDetails } from "./profile.mjs";
import { normalizeWardrobeVisualAttributes } from "../supabase/functions/_shared/wardrobe-vision.js";

const iconsByType = {
  Top: "✦",
  Bottom: "◒",
  Layer: "▱",
  Shoes: "⌁",
  Accessory: "◇",
};

let cloudClient = null;

export function setCloudWardrobeClient(client) {
  cloudClient = client || null;
}

function requireClient() {
  if (!cloudClient) {
    throw new Error("Cloud storage is not configured.");
  }
  return cloudClient;
}

function firstColor(colors) {
  return Array.isArray(colors) && colors.length > 0 ? colors[0] : {};
}

export function fromCloudWardrobeItem(row) {
  const color = firstColor(row.colors);
  const visualAttributes = normalizeWardrobeVisualAttributes(row.visual_attributes);
  return {
    id: row.client_key || `cloud-${row.id}`,
    _cloudId: row.id,
    name: row.name,
    type: row.category,
    tone: color.name || "Unspecified",
    color: color.hex || "#d4c4e8",
    icon: iconsByType[row.category] || "✦",
    formality: Number.isInteger(row.formality) && [1, 2, 3].includes(row.formality)
      ? row.formality
      : null,
    formalityExplicit: visualAttributes.formalityConfirmed,
    weather: row.climate_tags?.[0] || "all",
    note: row.fit_note || row.care_notes || "Added to your wardrobe",
    visualAttributes,
  };
}

function toCloudWardrobeItem(item, userId) {
  return {
    user_id: userId,
    client_key: item.id,
    category: item.type,
    name: item.name.trim(),
    colors: [{ name: item.tone || "Unspecified", hex: item.color }],
    formality: Number.isInteger(item.formality) ? item.formality : null,
    climate_tags: item.weather && item.weather !== "all" ? [item.weather] : [],
    fit_note: item.note || null,
    visual_attributes: normalizeWardrobeVisualAttributes({
      ...item.visualAttributes,
      formalityConfirmed: item.formalityExplicit === true,
    }),
  };
}

function throwIfError(error) {
  if (error) throw error;
}

function isMissingProfileDetailsColumn(error) {
  const message = String(error?.message || "").toLowerCase();
  return ["42703", "PGRST204"].includes(error?.code) && message.includes("profile_details");
}

export async function listCloudWardrobeItems(userId) {
  const client = requireClient();
  const { data, error } = await client
    .from("wardrobe_items")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  throwIfError(error);
  return (data || []).map(fromCloudWardrobeItem);
}

export async function loadCloudProfile(userId) {
  const client = requireClient();
  const result = await client
    .from("profiles")
    .select("display_name, option_count, weather_permission, weather_location, profile_details")
    .eq("id", userId)
    .maybeSingle();
  if (!isMissingProfileDetailsColumn(result.error)) {
    throwIfError(result.error);
    return result.data;
  }

  const legacyResult = await client
    .from("profiles")
    .select("display_name, option_count, weather_permission, weather_location")
    .eq("id", userId)
    .maybeSingle();
  throwIfError(legacyResult.error);
  return legacyResult.data ? { ...legacyResult.data, profile_details: null } : null;
}

export async function createCloudWardrobeItem(item, userId) {
  const client = requireClient();
  const { data, error } = await client
    .from("wardrobe_items")
    .insert(toCloudWardrobeItem(item, userId))
    .select("*")
    .single();
  throwIfError(error);
  return fromCloudWardrobeItem(data);
}

export async function updateCloudWardrobeItem(item, userId) {
  const client = requireClient();
  if (!item._cloudId) {
    return createCloudWardrobeItem(item, userId);
  }

  const { data, error } = await client
    .from("wardrobe_items")
    .update(toCloudWardrobeItem(item, userId))
    .eq("id", item._cloudId)
    .select("*")
    .single();
  throwIfError(error);
  return fromCloudWardrobeItem(data);
}

export async function deleteCloudWardrobeItem(item) {
  const client = requireClient();
  if (!item._cloudId) return;

  const { error } = await client
    .from("wardrobe_items")
    .delete()
    .eq("id", item._cloudId);
  throwIfError(error);
}

export async function saveCloudProfile(
  user,
  optionCount,
  explicitDisplayName = "",
  weatherSettings = {},
  profileDetails = null,
) {
  const client = requireClient();
  const displayName =
    explicitDisplayName.trim() ||
    user.user_metadata?.display_name ||
    user.user_metadata?.full_name ||
    null;
  const profile = {
    id: user.id,
    display_name: displayName,
    option_count: optionCount,
    weather_permission: weatherSettings.weatherPermission || "not_asked",
    weather_location: weatherSettings.weatherLocation || {},
    updated_at: new Date().toISOString(),
  };
  if (profileDetails !== null) {
    profile.profile_details = normalizeProfileDetails(profileDetails);
  }
  const { error } = await client.from("profiles").upsert(profile, { onConflict: "id" });
  if (isMissingProfileDetailsColumn(error)) {
    const legacyProfile = { ...profile };
    delete legacyProfile.profile_details;
    const { error: legacyError } = await client
      .from("profiles")
      .upsert(legacyProfile, { onConflict: "id" });
    throwIfError(legacyError);
    return false;
  }
  throwIfError(error);
  return true;
}