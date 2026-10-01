import { supabase } from "./supabase";

const iconsByType = {
  Top: "✦",
  Bottom: "◒",
  Layer: "▱",
  Shoes: "⌁",
  Accessory: "◇",
};

function requireClient() {
  if (!supabase) {
    throw new Error("Cloud storage is not configured.");
  }
  return supabase;
}

function firstColor(colors) {
  return Array.isArray(colors) && colors.length > 0 ? colors[0] : {};
}

export function fromCloudWardrobeItem(row) {
  const color = firstColor(row.colors);
  return {
    id: row.client_key || `cloud-${row.id}`,
    _cloudId: row.id,
    name: row.name,
    type: row.category,
    tone: color.name || "Unspecified",
    color: color.hex || "#d4c4e8",
    icon: iconsByType[row.category] || "✦",
    formality: row.formality || 2,
    weather: row.climate_tags?.[0] || "all",
    note: row.fit_note || row.care_notes || "Added to your wardrobe",
  };
}

function toCloudWardrobeItem(item, userId) {
  return {
    user_id: userId,
    client_key: item.id,
    category: item.type,
    name: item.name.trim(),
    colors: [{ name: item.tone || "Unspecified", hex: item.color }],
    formality: item.formality || 2,
    climate_tags: item.weather && item.weather !== "all" ? [item.weather] : [],
    fit_note: item.note || null,
  };
}

function throwIfError(error) {
  if (error) throw error;
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
  const { data, error } = await client
    .from("profiles")
    .select("display_name, option_count, weather_permission, weather_location")
    .eq("id", userId)
    .maybeSingle();
  throwIfError(error);
  return data;
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
) {
  const client = requireClient();
  const displayName =
    explicitDisplayName.trim() ||
    user.user_metadata?.display_name ||
    user.user_metadata?.full_name ||
    null;
  const { error } = await client.from("profiles").upsert(
    {
      id: user.id,
      display_name: displayName,
      option_count: optionCount,
      weather_permission: weatherSettings.weatherPermission || "not_asked",
      weather_location: weatherSettings.weatherLocation || {},
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  throwIfError(error);
}