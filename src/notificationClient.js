import { supabase } from "./supabase";

const JOB_TABLE = "notification_jobs";
const DEVICE_TABLE = "notification_devices";
const REMINDER_KIND = "saved_look_reminder";
const WEATHER_KIND = "weather_change";

function requireClient() {
  if (!supabase) {
    throw new Error("Notifications need a configured Wearwell account.");
  }
  return supabase;
}

function throwIfError(error) {
  if (error) throw error;
}

function serviceWorkerPath() {
  const basePath = import.meta.env.BASE_URL || "/";
  const normalizedBase = basePath.endsWith("/") ? basePath : `${basePath}/`;
  return `${normalizedBase}wearwell-notifications-sw.js`;
}

async function getServiceWorkerRegistration() {
  if (
    typeof window === "undefined" ||
    !window.isSecureContext ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  ) {
    throw new Error("This browser cannot receive background notifications.");
  }
  return navigator.serviceWorker.register(serviceWorkerPath(), {
    scope: import.meta.env.BASE_URL || "/",
  });
}

function decodePublicKey(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = window.atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export async function getBrowserPushStatus(userId) {
  if (!userId) return "signed-out";
  if (
    typeof window === "undefined" ||
    !window.isSecureContext ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  ) {
    return "unsupported";
  }
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission !== "granted") return "permission-required";

  const registration = await getServiceWorkerRegistration();
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return "not-subscribed";

  const client = requireClient();
  const { data, error } = await client
    .from(DEVICE_TABLE)
    .select("id")
    .eq("user_id", userId)
    .eq("endpoint", subscription.endpoint)
    .maybeSingle();
  throwIfError(error);
  return data ? "subscribed" : "needs-registration";
}

export async function registerBrowserPushDevice(userId) {
  if (!userId) throw new Error("Sign in before enabling background notifications.");
  const publicKey = import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY?.trim();
  if (!publicKey) {
    throw new Error("Web push is not configured yet. Add the VAPID public key first.");
  }
  if (!("Notification" in window)) {
    throw new Error("This browser does not support notifications.");
  }

  let permission = Notification.permission;
  if (permission === "default") permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error(
      permission === "denied"
        ? "Notifications are blocked in this browser. Change the site permission in browser settings."
        : "Notification permission was not granted.",
    );
  }

  const registration = await getServiceWorkerRegistration();
  const subscription =
    (await registration.pushManager.getSubscription()) ||
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodePublicKey(publicKey),
    }));

  const client = requireClient();
  const { error } = await client.rpc("register_notification_device", {
    p_platform: "web",
    p_endpoint: subscription.endpoint,
    p_subscription: subscription.toJSON(),
  });
  throwIfError(error);
  return subscription;
}

export async function removeBrowserPushDevice(userId) {
  if (!userId || typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }
  const registration = await getServiceWorkerRegistration();
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  const client = requireClient();
  const { error } = await client
    .from(DEVICE_TABLE)
    .delete()
    .eq("user_id", userId)
    .eq("endpoint", subscription.endpoint);
  throwIfError(error);
  await subscription.unsubscribe();
}

export async function loadNotificationJobs(userId) {
  const client = requireClient();
  const { data, error } = await client
    .from(JOB_TABLE)
    .select("id,kind,source_id,scheduled_at,status,payload,sent_at,read_at,created_at")
    .eq("user_id", userId)
    .in("status", ["pending", "processing", "sent", "failed", "expired"])
    .order("created_at", { ascending: false })
    .limit(30);
  throwIfError(error);
  return data || [];
}

export async function createSavedLookReminder(userId, entry, scheduledAt) {
  const client = requireClient();
  const eventLabel = entry.eventLabel || entry.dayBrief?.occasion || "your event";
  const { error } = await client.from(JOB_TABLE).upsert(
    {
      user_id: userId,
      kind: REMINDER_KIND,
      source_id: entry.id,
      scheduled_at: scheduledAt,
      status: "pending",
      payload: {
        title: "Your saved look reminder",
        body: `${entry.outfitName} is ready for ${eventLabel}.`,
        eventLabel,
        outfitName: entry.outfitName,
        url: "/",
      },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,kind,source_id" },
  );
  throwIfError(error);
}

export async function createLiveWeatherWatch(userId, entry, query, baseline) {
  const client = requireClient();
  const now = Date.now();
  const eventEnd = new Date(query?.end).getTime();
  if (!Number.isFinite(eventEnd) || eventEnd <= now + 5 * 60 * 1000) {
    return false;
  }
  const { error } = await client.from(JOB_TABLE).upsert(
    {
      user_id: userId,
      kind: WEATHER_KIND,
      source_id: entry.id,
      scheduled_at: new Date(now + 15 * 60 * 1000).toISOString(),
      status: "pending",
      payload: {
        title: "A live forecast changed",
        eventLabel: entry.eventLabel || entry.dayBrief?.occasion || "your event",
        outfitName: entry.outfitName,
        query,
        baseline: {
          tempC: Number.isFinite(baseline.tempC) ? baseline.tempC : null,
          rainProbability: Number.isFinite(baseline.rainProbability)
            ? baseline.rainProbability
            : null,
          source: baseline.source,
        },
        url: "/",
      },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,kind,source_id" },
  );
  throwIfError(error);
  return true;
}

export async function cancelNotificationJob(userId, jobId) {
  const client = requireClient();
  const { error } = await client
    .from(JOB_TABLE)
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("id", jobId)
    .in("status", ["pending", "processing"]);
  throwIfError(error);
}

export async function cancelNotificationJobsByKind(userId, kind) {
  const client = requireClient();
  const { error } = await client
    .from(JOB_TABLE)
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("kind", kind)
    .in("status", ["pending", "processing"]);
  throwIfError(error);
}

export async function markNotificationJobsRead(userId, jobIds) {
  if (!jobIds.length) return;
  const client = requireClient();
  const { error } = await client
    .from(JOB_TABLE)
    .update({ read_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("status", "sent")
    .is("read_at", null)
    .in("id", jobIds);
  throwIfError(error);
}