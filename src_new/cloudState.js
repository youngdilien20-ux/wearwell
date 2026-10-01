import { supabase } from "./supabase";
import { normalizeDayPlan, persistedDayPlan } from "./dayPlan.mjs";

const DEFAULT_FEEDBACK = Object.freeze({
  woreIt: "",
  comfort: "",
  likedColors: "",
  wouldWearAgain: "",
});

function requireClient() {
  if (!supabase) {
    throw new Error("Cloud storage is not configured.");
  }
  return supabase;
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function toCloudSettings(userId, state) {
  return {
    user_id: userId,
    plan: state.plan,
    brief: state.brief,
    options: state.options,
    selected_outfit_id: state.selected || null,
    day_brief: state.dayBrief || {},
    day_plan: persistedDayPlan(state.dayPlan),
    settings: state.settings || {},
    updated_at: new Date().toISOString(),
  };
}

function fromCloudSettings(row) {
  if (!row) return null;
  return {
    plan: typeof row.plan === "string" ? row.plan : null,
    brief: typeof row.brief === "string" ? row.brief : null,
    options: [2, 3].includes(row.options) ? row.options : null,
    selected: typeof row.selected_outfit_id === "string" ? row.selected_outfit_id : null,
    dayBrief: isRecord(row.day_brief) ? row.day_brief : null,
    dayPlan: row.day_plan && typeof row.day_plan === "object"
      ? normalizeDayPlan(row.day_plan, { fallbackBrief: row.brief || "", fallbackOccasion: row.plan || "" })
      : null,
    settings: isRecord(row.settings) ? row.settings : null,
  };
}

function toCloudHistoryEntry(entry, userId) {
  return {
    id: entry.id,
    user_id: userId,
    created_at: entry.createdAt,
    outfit_id: entry.outfitId,
    outfit_name: entry.outfitName,
    item_ids: entry.itemIds,
    item_names: entry.itemNames,
    reason: entry.reason,
    weather: entry.weather,
    formality: entry.formality,
    day_brief: entry.dayBrief,
    feedback: entry.feedback || DEFAULT_FEEDBACK,
    updated_at: new Date().toISOString(),
  };
}

function fromCloudHistoryEntry(row) {
  return {
    id: row.id,
    createdAt: row.created_at,
    outfitId: row.outfit_id,
    outfitName: row.outfit_name,
    itemIds: Array.isArray(row.item_ids) ? row.item_ids : [],
    itemNames: Array.isArray(row.item_names) ? row.item_names : [],
    reason: row.reason || "",
    weather: row.weather || "",
    formality: row.formality || "",
    dayBrief: isRecord(row.day_brief) ? row.day_brief : {},
    feedback: isRecord(row.feedback) ? { ...DEFAULT_FEEDBACK, ...row.feedback } : { ...DEFAULT_FEEDBACK },
  };
}

export async function loadCloudAppState(userId) {
  const client = requireClient();
  const [{ data: settings, error: settingsError }, { data: history, error: historyError }] =
    await Promise.all([
      client.from("user_settings").select("*").eq("user_id", userId).maybeSingle(),
      client.from("wear_history").select("*").eq("user_id", userId).order("created_at", { ascending: true }),
    ]);

  if (settingsError) throw settingsError;
  if (historyError) throw historyError;

  return {
    settings: fromCloudSettings(settings),
    wearHistory: (history || []).map(fromCloudHistoryEntry),
  };
}

export async function saveCloudAppState(userId, state) {
  const client = requireClient();
  const { error: settingsError } = await client
    .from("user_settings")
    .upsert(toCloudSettings(userId, state), { onConflict: "user_id" });
  if (settingsError) throw settingsError;

  const entries = Array.isArray(state.wearHistory) ? state.wearHistory.slice(-200) : [];
  if (entries.length > 0) {
    const { error } = await client
      .from("wear_history")
      .upsert(entries.map((entry) => toCloudHistoryEntry(entry, userId)), { onConflict: "id" });
    if (error) throw error;
  }

  const { data: existingRows, error: existingError } = await client
    .from("wear_history")
    .select("id")
    .eq("user_id", userId);
  if (existingError) throw existingError;

  const keepIds = new Set(entries.map((entry) => entry.id));
  const staleIds = (existingRows || []).map((row) => row.id).filter((id) => !keepIds.has(id));
  for (const id of staleIds) {
    const { error } = await client
      .from("wear_history")
      .delete()
      .eq("user_id", userId)
      .eq("id", id);
    if (error) throw error;
  }
}