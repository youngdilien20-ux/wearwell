import webPush from "web-push";
import { logger } from "./logger";
import { significantWeatherChange } from "./notificationRules.mjs";

type NotificationKind = "saved_look_reminder" | "weather_change";
type NotificationJob = {
  id: string;
  user_id: string;
  kind: NotificationKind;
  scheduled_at: string;
  status: string;
  payload: Record<string, unknown>;
  attempt_count: number;
};
type NotificationDevice = {
  id: string;
  subscription: webPush.PushSubscription;
};
type WeatherQuery = Record<string, unknown> & {
  end?: string;
  timezone?: string;
};
type LiveForecast = {
  tempC?: number;
  rainProbability?: number;
  source?: string;
};

const DISPATCH_INTERVAL_MS = 60_000;
const WEATHER_RECHECK_MS = 15 * 60_000;
const REMINDER_RETRY_MS = 5 * 60_000;
const MAX_REMINDER_ATTEMPTS = 6;
const CLAIM_LIMIT = 20;

function readConfiguration() {
  const url = (process.env["SUPABASE_URL"] || process.env["VITE_SUPABASE_URL"] || "")
    .replace(/\/+$/, "");
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"] || "";
  const vapidPublicKey = process.env["VITE_WEB_PUSH_PUBLIC_KEY"] || "";
  const vapidPrivateKey = process.env["WEB_PUSH_VAPID_PRIVATE_KEY"] || "";
  const missing = [
    !url && "VITE_SUPABASE_URL",
    !serviceRoleKey && "SUPABASE_SERVICE_ROLE_KEY",
    !vapidPublicKey && "VITE_WEB_PUSH_PUBLIC_KEY",
    !vapidPrivateKey && "WEB_PUSH_VAPID_PRIVATE_KEY",
  ].filter(Boolean);
  return {
    url,
    serviceRoleKey,
    vapidPublicKey,
    vapidPrivateKey,
    vapidSubject: process.env["WEB_PUSH_VAPID_SUBJECT"] || "mailto:notifications@wearwell.app",
    missing,
  };
}

const configuration = readConfiguration();

async function supabaseRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  if (configuration.missing.length) {
    throw new Error("Notification delivery is not configured.");
  }
  const response = await fetch(`${configuration.url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: configuration.serviceRoleKey,
      authorization: `Bearer ${configuration.serviceRoleKey}`,
      "content-type": "application/json",
      prefer: "return=minimal",
      ...init.headers,
    },
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`Supabase request failed (${response.status}): ${detail}`);
  }
  if (response.status === 204) return null as T;
  return (await response.json()) as T;
}

function resourceWithQuery(resource: string, query: Record<string, string>) {
  const params = new URLSearchParams(query);
  return `${resource}?${params.toString()}`;
}

async function updateJob(jobId: string, changes: Record<string, unknown>) {
  await supabaseRequest(
    resourceWithQuery("notification_jobs", { id: `eq.${jobId}` }),
    {
      method: "PATCH",
      body: JSON.stringify({
        ...changes,
        updated_at: new Date().toISOString(),
      }),
    },
  );
}

async function finishJob(
  job: NotificationJob,
  status: "sent" | "failed" | "cancelled" | "expired",
  changes: Record<string, unknown> = {},
) {
  await updateJob(job.id, {
    status,
    ...(status === "sent" ? { sent_at: new Date().toISOString(), last_error: null } : {}),
    ...changes,
  });
}

async function deferJob(job: NotificationJob, delayMs: number, error?: string) {
  await updateJob(job.id, {
    status: "pending",
    scheduled_at: new Date(Date.now() + delayMs).toISOString(),
    ...(error ? { last_error: error.slice(0, 500) } : {}),
  });
}

async function readUserNotificationSettings(userId: string) {
  const rows = await supabaseRequest<Array<{ settings?: Record<string, unknown> }>>(
    resourceWithQuery("user_settings", {
      user_id: `eq.${userId}`,
      select: "settings",
      limit: "1",
    }),
  );
  return rows[0]?.settings || {};
}

async function readWebDevices(userId: string) {
  return supabaseRequest<NotificationDevice[]>(
    resourceWithQuery("notification_devices", {
      user_id: `eq.${userId}`,
      platform: "eq.web",
      select: "id,subscription",
    }),
  );
}

async function deleteDevice(deviceId: string) {
  await supabaseRequest(
    resourceWithQuery("notification_devices", { id: `eq.${deviceId}` }),
    { method: "DELETE" },
  );
}

async function loadLiveForecast(query: WeatherQuery) {
  const response = await fetch(`${configuration.url}/functions/v1/get-weather-context`, {
    method: "POST",
    headers: {
      apikey: configuration.serviceRoleKey,
      authorization: `Bearer ${configuration.serviceRoleKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(query),
  });
  if (!response.ok) {
    throw new Error(`Live weather check failed (${response.status}).`);
  }
  return (await response.json()) as LiveForecast;
}

function hasLiveForecast(value: LiveForecast) {
  return (
    typeof value.source === "string" &&
    value.source.toLowerCase().includes("open-meteo") &&
    (Number.isFinite(value.tempC) || Number.isFinite(value.rainProbability))
  );
}

function formatWeatherMessage(job: NotificationJob, change: NonNullable<ReturnType<typeof significantWeatherChange>>) {
  const eventLabel =
    typeof job.payload.eventLabel === "string" ? job.payload.eventLabel : "your event";
  if (change.kind === "rain") {
    return `Rain is now likely (${Math.round(change.after)}%, up from ${Math.round(change.before)}%) during ${eventLabel}. Review your saved look.`;
  }
  const direction = change.after < change.before ? "down" : "up";
  return `The forecast is now ${Math.round(change.after)}°C, ${Math.abs(Math.round(change.after - change.before))}° ${direction} from before during ${eventLabel}. Review your saved look.`;
}

async function sendToUser(job: NotificationJob, body?: string) {
  const devices = await readWebDevices(job.user_id);
  if (!devices.length) {
    await finishJob(job, "failed", { last_error: "No active browser push subscription." });
    return false;
  }

  const notification = {
    title:
      typeof job.payload.title === "string" ? job.payload.title : "Wearwell notification",
    body: body ||
      (typeof job.payload.body === "string"
        ? job.payload.body
        : "A saved look needs your attention."),
    jobId: job.id,
    url: typeof job.payload.url === "string" ? job.payload.url : "/",
  };
  let delivered = false;
  const transientErrors: string[] = [];

  for (const device of devices) {
    try {
      await webPush.sendNotification(
        device.subscription,
        JSON.stringify(notification),
        { TTL: 3600, urgency: "normal" },
      );
      delivered = true;
    } catch (error) {
      const statusCode =
        typeof error === "object" && error !== null && "statusCode" in error
          ? Number((error as { statusCode?: unknown }).statusCode)
          : 0;
      if (statusCode === 404 || statusCode === 410) {
        await deleteDevice(device.id);
      } else {
        transientErrors.push(
          error instanceof Error ? error.message : "Push provider request failed.",
        );
      }
    }
  }

  if (delivered) {
    await finishJob(job, "sent");
    return true;
  }
  if (transientErrors.length > 0 && job.attempt_count < MAX_REMINDER_ATTEMPTS) {
    await deferJob(job, REMINDER_RETRY_MS, transientErrors.join("; "));
    return false;
  }
  await finishJob(job, "failed", {
    last_error: "Push could not be delivered to any active browser.",
  });
  return false;
}

async function processReminder(job: NotificationJob) {
  const settings = await readUserNotificationSettings(job.user_id);
  if (settings["savedLookRemindersEnabled"] !== true) {
    await finishJob(job, "cancelled", { last_error: "Saved-look reminders are off." });
    return;
  }
  await sendToUser(job);
}

async function processWeatherWatch(job: NotificationJob) {
  const settings = await readUserNotificationSettings(job.user_id);
  if (settings["weatherAlertsEnabled"] !== true) {
    await finishJob(job, "cancelled", { last_error: "Weather alerts are off." });
    return;
  }

  const query = job.payload.query as WeatherQuery | undefined;
  const eventEnd = new Date(query?.end || "").getTime();
  if (!query || !Number.isFinite(eventEnd) || eventEnd <= Date.now()) {
    await finishJob(job, "expired", { last_error: "The forecast window has ended." });
    return;
  }

  try {
    const forecast = await loadLiveForecast(query);
    const baseline = job.payload.baseline as Record<string, unknown> | undefined;
    if (hasLiveForecast(forecast)) {
      const change = significantWeatherChange(
        {
          tempC: Number.isFinite(baseline?.["tempC"])
            ? Number(baseline?.["tempC"])
            : undefined,
          rainProbability: Number.isFinite(baseline?.["rainProbability"])
            ? Number(baseline?.["rainProbability"])
            : undefined,
        },
        forecast,
      );
      if (change) {
        await sendToUser(job, formatWeatherMessage(job, change));
        return;
      }
    }
    await deferJob(job, WEATHER_RECHECK_MS);
  } catch (error) {
    logger.warn(
      { jobId: job.id, error: error instanceof Error ? error.message : String(error) },
      "Live weather notification check will retry",
    );
    await deferJob(job, WEATHER_RECHECK_MS);
  }
}

async function processJob(job: NotificationJob) {
  try {
    if (job.kind === "saved_look_reminder") {
      await processReminder(job);
    } else if (job.kind === "weather_change") {
      await processWeatherWatch(job);
    } else {
      await finishJob(job, "failed", { last_error: "Unsupported notification type." });
    }
  } catch (error) {
    logger.error(
      { jobId: job.id, error: error instanceof Error ? error.message : String(error) },
      "Notification job failed",
    );
    if (job.kind === "saved_look_reminder" && job.attempt_count >= MAX_REMINDER_ATTEMPTS) {
      await finishJob(job, "failed", { last_error: "Notification delivery repeatedly failed." });
    } else {
      await deferJob(job, job.kind === "weather_change" ? WEATHER_RECHECK_MS : REMINDER_RETRY_MS);
    }
  }
}

let isRunning = false;

async function dispatchDueJobs() {
  if (isRunning) return;
  isRunning = true;
  try {
    const jobs = await supabaseRequest<NotificationJob[]>("rpc/claim_due_notification_jobs", {
      method: "POST",
      body: JSON.stringify({
        p_now: new Date().toISOString(),
        p_limit: CLAIM_LIMIT,
      }),
    });
    await Promise.all(jobs.map(processJob));
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "Notification dispatcher could not claim due jobs",
    );
  } finally {
    isRunning = false;
  }
}

export function startNotificationWorker() {
  if (configuration.missing.length) {
    logger.warn(
      { missingConfiguration: configuration.missing },
      "Background notifications are disabled until server secrets are configured",
    );
    return () => undefined;
  }

  try {
    webPush.setVapidDetails(
      configuration.vapidSubject,
      configuration.vapidPublicKey,
      configuration.vapidPrivateKey,
    );
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "Background notifications could not start because VAPID configuration is invalid",
    );
    return () => undefined;
  }

  void dispatchDueJobs();
  const timer = setInterval(() => void dispatchDueJobs(), DISPATCH_INTERVAL_MS);
  logger.info("Background notification dispatcher started");
  return () => clearInterval(timer);
}