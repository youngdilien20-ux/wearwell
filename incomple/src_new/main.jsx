import { useEffect, useMemo, useRef, useState } from "react";
import { extractDayBrief } from "./dayBrief.mjs";
import {
  eventStateFor,
  normalizeDayPlan,
  parseDayPlan,
  updateDayPlanEvent,
} from "./dayPlan.mjs";
import { scoreOutfitCandidates } from "./outfitScoring.mjs";
import {
  restoreSelectedRecommendation,
  selectRecommendation,
  swapOptionsFor,
  swapSelectedRecommendation,
} from "./selectionState.mjs";
import "./styles.css";
import {
  createCloudWardrobeItem,
  deleteCloudWardrobeItem,
  listCloudWardrobeItems,
  loadCloudProfile,
  saveCloudProfile,
  updateCloudWardrobeItem,
} from "./cloudWardrobe";
import { loadCloudAppState, saveCloudAppState } from "./cloudState";
import { readLocalState, writeLocalState } from "./storage";
import { cloudEnabled, supabase } from "./supabase";
import {
  FALLBACK_WEATHER,
  WEATHER_PERMISSION_REQUIRED,
  getDefaultWeatherQuery,
  getWeatherContext,
  WEATHER_TIMEZONE,
} from "./weather";

function parseWeatherLocationInput(input) {
  const value = input.trim();
  if (!value) return { location: null };
  const parts = value.split(",").map((part) => part.trim());
  const latitude = Number(parts[0]);
  const longitude = Number(parts[1]);
  if (parts.length === 2 && Number.isFinite(latitude) && Number.isFinite(longitude)) {
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return { location: null, error: "Coordinates must be between -90/90 latitude and -180/180 longitude." };
    }
    return { location: { latitude, longitude } };
  }
  return { location: { city: value } };
}

function formatWeatherLocation(location) {
  if (typeof location?.city === "string") return location.city;
  if (Number.isFinite(location?.latitude) && Number.isFinite(location?.longitude)) {
    return `${location.latitude}, ${location.longitude}`;
  }
  return "";
}

function itemSetKey(itemIds) {
  return Array.isArray(itemIds) ? itemIds.slice().sort().join("\u001f") : "";
}

const initialWardrobe = [
  { id: "shirt-seafoam", name: "Seafoam linen shirt", type: "Top", tone: "Seafoam", color: "#b7d8cf", icon: "✦", formality: 2, weather: "hot", note: "Relaxed fit · breathable" },
  { id: "trousers-ink", name: "Ink straight-leg trousers", type: "Bottom", tone: "Ink", color: "#26324b", icon: "◒", formality: 3, weather: "all", note: "Clean line · easy movement" },
  { id: "skirt-terracotta", name: "Terracotta wrap skirt", type: "Bottom", tone: "Terracotta", color: "#bd725b", icon: "◐", formality: 2, weather: "hot", note: "Lightweight · adjustable waist" },
  { id: "cardigan-cream", name: "Cream knit cardigan", type: "Layer", tone: "Cream", color: "#e5dbc9", icon: "▱", formality: 2, weather: "cool", note: "Soft hand · AC friendly" },
  { id: "sneakers-white", name: "White everyday sneakers", type: "Shoes", tone: "White", color: "#f3f0e8", icon: "⌁", formality: 1, weather: "all", note: "Already broken in" },
  { id: "loafers-brown", name: "Brown leather loafers", type: "Shoes", tone: "Brown", color: "#7d563e", icon: "⌁", formality: 3, weather: "all", note: "Polished · comfortable" },
];

const plans = ["Work", "Walk", "Shopping", "Church", "Friends"];
const defaultBrief =
  "I’m going to work today, then meeting a friend for a walk. I feel good, but I want something easy.";
const defaultState = {
  wardrobe: initialWardrobe,
  plan: "Work",
  brief: defaultBrief,
  options: 3,
  selected: null,
  dayBrief: extractDayBrief(defaultBrief, "Work"),
  dayPlan: parseDayPlan(defaultBrief, "Work"),
  settings: {
    temperatureUnit: "C",
    voiceLanguage: "en-GB",
    voiceEnabled: false,
    aiEnabled: false,
  },
  wearHistory: [],
};

const dayBriefFields = [
  { key: "timeWindow", label: "Time window" },
  { key: "duration", label: "Duration" },
  { key: "movement", label: "Movement" },
  { key: "dressCode", label: "Dress code" },
  { key: "mood", label: "Mood / feel" },
  { key: "comfortNeeds", label: "Comfort" },
  { key: "coverageNeeds", label: "Coverage" },
];

const assistantFieldLimits = Object.freeze({
  timeWindow: 80,
  duration: 80,
  movement: 160,
  dressCode: 100,
  mood: 120,
  comfortNeeds: 160,
  coverageNeeds: 120,
});
const assistantFieldLabels = Object.freeze({
  timeWindow: "Time window",
  duration: "Duration",
  movement: "Movement",
  dressCode: "Dress code",
  mood: "Mood / feel",
  comfortNeeds: "Comfort",
  coverageNeeds: "Coverage",
});
const feedbackFields = [
  {
    key: "woreIt",
    label: "Did you wear it?",
    options: [["", "Not answered"], ["yes", "Yes"], ["not-yet", "Not yet"]],
  },
  {
    key: "comfort",
    label: "Comfort",
    options: [["", "Not answered"], ["good", "Comfortable"], ["could-improve", "Could improve"]],
  },
  {
    key: "likedColors",
    label: "Colours",
    options: [["", "Not answered"], ["yes", "Liked them"], ["no", "Not for me"]],
  },
  {
    key: "wouldWearAgain",
    label: "Wear again?",
    options: [["", "Not answered"], ["yes", "Yes"], ["no", "No"]],
  },
];

const regenerationReasons = [
  ["more_casual", "Something more casual"],
  ["more_formal", "Something more polished"],
  ["more_color", "More colour"],
  ["less_attention", "Less attention"],
  ["different_shoes", "Different shoes"],
  ["more_comfort", "More comfort"],
  ["different_items", "Different items"],
];

function parseAssistantResponse(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const fields = {};
  if (payload.mode === "ai" && payload.fields && typeof payload.fields === "object") {
    for (const [key, limit] of Object.entries(assistantFieldLimits)) {
      const value = payload.fields[key];
      fields[key] =
        typeof value === "string" && value.trim().length <= limit
          ? value.trim()
          : "";
    }
  }
  return {
    mode: payload.mode === "ai" ? "ai" : "fallback",
    fields: payload.mode === "ai" ? fields : null,
    followUpQuestion:
      typeof payload.followUpQuestion === "string"
        ? payload.followUpQuestion.trim().slice(0, 240)
        : "",
    explanation:
      typeof payload.explanation === "string"
        ? payload.explanation.trim().slice(0, 400)
        : "Optional AI help is unavailable; local parsing and deterministic outfit rules remain active.",
  };
}

function formatHistoryDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Date not recorded";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function historyDayKey(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: WEATHER_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}


function Icon({ children, className = "" }) {
  return <span className={`icon ${className}`} aria-hidden="true">{children}</span>;
}

function sessionDisplayName(nextSession) {
  return (
    nextSession?.user?.user_metadata?.display_name ||
    nextSession?.user?.user_metadata?.full_name ||
    ""
  );
}

function App() {
  const savedState = useMemo(
    () => readLocalState({ defaults: defaultState, validPlans: plans }),
    [],
  );
  const initialDayPlan = useMemo(
    () => normalizeDayPlan(savedState.dayPlan, {
      fallbackBrief: savedState.brief,
      fallbackOccasion: savedState.plan,
      legacySelected: savedState.selected,
    }),
    [savedState],
  );
  const [activeTab, setActiveTab] = useState("today");
  const [wardrobe, setWardrobe] = useState(() => savedState.wardrobe);
  const [plan, setPlan] = useState(() => savedState.plan);
  const [brief, setBrief] = useState(() => savedState.brief);
  const [dayBrief, setDayBrief] = useState(() => savedState.dayBrief);
  const [dayPlan, setDayPlan] = useState(() => initialDayPlan);
  const [activeEventId, setActiveEventId] = useState(() => initialDayPlan.events[0]?.id || "event-1");
  const [options, setOptions] = useState(() => savedState.options);
  const [listening, setListening] = useState(false);
  const [selected, setSelected] = useState(() => {
    return restoreSelectedRecommendation(savedState);
  });
  const [settings, setSettings] = useState(() => savedState.settings);
  const [wearHistory, setWearHistory] = useState(() => savedState.wearHistory);
  const [toast, setToast] = useState("");
  const [showAddItem, setShowAddItem] = useState(false);
  const [editingItemId, setEditingItemId] = useState(null);
  const [newItem, setNewItem] = useState({ name: "", type: "Top", tone: "New", color: "#d4c4e8", note: "" });
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(!cloudEnabled);
  const [authEmail, setAuthEmail] = useState("");
  const [profileName, setProfileName] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [cloudStatus, setCloudStatus] = useState(cloudEnabled ? "checking" : "local");
  const [weather, setWeather] = useState(() => FALLBACK_WEATHER);
  const [weatherStatus, setWeatherStatus] = useState(cloudEnabled ? "checking" : "fallback");
  const [weatherPermission, setWeatherPermission] = useState("not_asked");
  const [weatherLocation, setWeatherLocation] = useState(null);
  const [weatherLocationInput, setWeatherLocationInput] = useState("");
  const [nextWearPlanReady, setNextWearPlanReady] = useState(false);
  const [showRegenerateOptions, setShowRegenerateOptions] = useState(false);
  const [swapOutfitId, setSwapOutfitId] = useState(null);
  const [swapOverrides, setSwapOverrides] = useState({});
  const [assistantStatus, setAssistantStatus] = useState("idle");
  const [assistantResult, setAssistantResult] = useState(null);
  const recognitionRef = useRef(null);
  const briefRef = useRef(brief);
  const assistantRequestId = useRef(0);
  const cloudStateHydratedRef = useRef(false);
  const activeEvent = eventStateFor(dayPlan, activeEventId);
  const activeDayBrief = activeEvent?.dayBrief || dayBrief;
  const activeSelected = activeEvent?.selectedRecommendation || null;
  const activeExcludedItemSets = activeEvent?.excludedItemSets || [];
  const activeRegenerationReason = activeEvent?.regenerationReason || "";
  const activeSwapOverrides = swapOverrides[activeEventId] || {};

  useEffect(() => {
    writeLocalState({
      wardrobe,
      plan,
      brief,
      options,
      selected,
      dayBrief,
      dayPlan,
      settings,
      wearHistory,
    });
  }, [wardrobe, plan, brief, options, selected, dayBrief, dayPlan, settings, wearHistory]);

  useEffect(() => {
    if (!authReady || !session?.user || !cloudStateHydratedRef.current) return undefined;
    const timer = window.setTimeout(async () => {
      try {
        await saveCloudAppState(session.user.id, {
          plan,
          brief,
          options,
          selected,
          dayBrief,
          dayPlan,
          settings,
          wearHistory,
        });
        setCloudStatus("synced");
      } catch (error) {
        console.error("Wearwell app state sync failed", error);
        setCloudStatus("error");
      }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [authReady, session?.user?.id, plan, brief, options, selected, dayBrief, dayPlan, settings, wearHistory]);

  useEffect(() => {
    if (!activeEvent) return;
    setDayBrief(activeEvent.dayBrief);
    setSelected(activeEvent.selectedRecommendation || null);
    setSwapOutfitId(null);
  }, [activeEventId]);

  useEffect(() => {
    briefRef.current = brief;
  }, [brief]);

  useEffect(() => () => {
    recognitionRef.current?.abort();
    window.speechSynthesis?.cancel();
  }, []);

  useEffect(() => {
    if (settings.voiceEnabled) return;
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    setListening(false);
    window.speechSynthesis?.cancel();
  }, [settings.voiceEnabled]);

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true);
      return undefined;
    }

    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setProfileName(sessionDisplayName(data.session));
      setAuthReady(true);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setProfileName(sessionDisplayName(nextSession));
      setAuthReady(true);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!authReady || !cloudEnabled) return;
    if (!session?.user) {
      cloudStateHydratedRef.current = false;
      setCloudStatus("signed-out");
      return;
    }

    let active = true;
    async function hydrateCloudState() {
      setCloudStatus("syncing");
      try {
        const [cloudItems, cloudProfile] = await Promise.all([
          listCloudWardrobeItems(session.user.id),
          loadCloudProfile(session.user.id),
        ]);
        const cloudAppState = await loadCloudAppState(session.user.id);
        if (!active) return;

        if (cloudProfile) {
          if ([2, 3].includes(cloudProfile.option_count)) {
            setOptions(cloudProfile.option_count);
          }
          setProfileName(cloudProfile.display_name || "");
          const savedLocation = cloudProfile.weather_location || null;
          setWeatherPermission(cloudProfile.weather_permission || "not_asked");
          setWeatherLocation(savedLocation && formatWeatherLocation(savedLocation) ? savedLocation : null);
          setWeatherLocationInput(formatWeatherLocation(savedLocation));
        } else {
          await saveCloudProfile(session.user, options, profileName, {
            weatherPermission,
            weatherLocation,
          });
        }

        if (cloudItems.length > 0) {
          setWardrobe(cloudItems);
        } else if (wardrobe.length > 0) {
          const migratedItems = await Promise.all(
            wardrobe.map((item) => createCloudWardrobeItem(item, session.user.id)),
          );
          if (active) {
            setWardrobe(migratedItems);
            notify("Your wardrobe is now saved to your account.");
          }
        }

        if (cloudAppState.settings) {
          const savedAppState = cloudAppState.settings;
          if (savedAppState.plan) setPlan(savedAppState.plan);
          if (savedAppState.brief !== null) setBrief(savedAppState.brief);
          if (savedAppState.options) setOptions(savedAppState.options);
          const nextDayPlan = savedAppState.dayPlan || dayPlan;
          setDayPlan(nextDayPlan);
          setActiveEventId(nextDayPlan.events[0]?.id || "event-1");
          const nextEvent = eventStateFor(nextDayPlan, nextDayPlan.events[0]?.id);
          setSelected(nextEvent?.selectedRecommendation || savedAppState.selected || null);
          if (nextEvent?.dayBrief) setDayBrief(nextEvent.dayBrief);
          else if (savedAppState.dayBrief) setDayBrief((current) => ({ ...current, ...savedAppState.dayBrief }));
          if (savedAppState.settings) setSettings((current) => ({ ...current, ...savedAppState.settings }));
          setWearHistory(cloudAppState.wearHistory);
        } else {
          await saveCloudAppState(session.user.id, {
            plan,
            brief,
            options,
            selected,
            dayBrief,
            dayPlan,
            settings,
            wearHistory,
          });
        }

        if (active) {
          cloudStateHydratedRef.current = true;
          setCloudStatus("synced");
        }
      } catch (error) {
        console.error("Wearwell cloud sync failed", error);
        if (active) {
          setCloudStatus("error");
          notify("We kept your wardrobe on this device while sync recovers.");
        }
      }
    }

    hydrateCloudState();
    return () => {
      active = false;
    };
  }, [authReady, session?.user?.id]);

  useEffect(() => {
    if (!authReady || !cloudEnabled || !session?.user) {
      setWeather(FALLBACK_WEATHER);
      setWeatherStatus("fallback");
      return undefined;
    }
    if (weatherPermission !== "granted" || !weatherLocation) {
      setWeather(WEATHER_PERMISSION_REQUIRED);
      setWeatherStatus("permission");
      return undefined;
    }

    let active = true;
    setWeatherStatus("loading");
    getWeatherContext(getDefaultWeatherQuery(weatherLocation, new Date(), activeDayBrief.timeWindow))
      .then((nextWeather) => {
        if (!active) return;
        setWeather(nextWeather);
        setWeatherStatus("live");
      })
      .catch((error) => {
        console.error("Wearwell weather lookup failed", error);
        if (!active) return;
        setWeather(FALLBACK_WEATHER);
        setWeatherStatus("fallback");
        notify("Live weather is unavailable, so we kept the sample conditions.");
      });

    return () => {
      active = false;
    };
  }, [authReady, session?.user?.id, weatherPermission, weatherLocation?.city, weatherLocation?.latitude, weatherLocation?.longitude, activeDayBrief.timeWindow]);

  const recommendationSet = useMemo(
    () => scoreOutfitCandidates(wardrobe, {
      dayBrief: activeDayBrief,
      weather,
      wearHistory,
      regenerationReason: activeRegenerationReason,
      excludedItemSets: activeExcludedItemSets,
    }),
    [wardrobe, activeDayBrief, weather, wearHistory, activeRegenerationReason, activeExcludedItemSets],
  );
  const swapRecommendationSet = useMemo(
    () => scoreOutfitCandidates(wardrobe, { dayBrief: activeDayBrief, weather, wearHistory }),
    [wardrobe, activeDayBrief, weather, wearHistory],
  );
  const visibleOutfits = useMemo(() => {
    const candidates = recommendationSet.candidates;
    if (candidates.length === 0) return [];
    const count = Math.min(options, candidates.length);
    const visibleCandidates = candidates.slice(0, count);
    if (activeSelected && !visibleCandidates.some((candidate) => candidate.id === activeSelected)) {
      const activeCandidate = swapRecommendationSet.candidates.find((candidate) => candidate.id === activeSelected);
      if (activeCandidate) {
        visibleCandidates.splice(Math.max(0, visibleCandidates.length - 1), 1, activeCandidate);
      }
    }
    return visibleCandidates.map((candidate, index) => ({
      ...(activeSwapOverrides[candidate.id] || candidate),
      baseId: candidate.id,
      name: "Look " + String(index + 1).padStart(2, "0"),
    }));
  }, [recommendationSet, swapRecommendationSet, options, activeSelected, activeSwapOverrides]);

  const wardrobeById = useMemo(() => Object.fromEntries(wardrobe.map((item) => [item.id, item])), [wardrobe]);
  const accountName =
    profileName.trim() ||
    session?.user?.user_metadata?.display_name ||
    session?.user?.user_metadata?.full_name ||
    session?.user?.email?.split("@")[0] ||
    "your account";
  const accountInitial = accountName.charAt(0).toUpperCase();
  const todayLabel = new Intl.DateTimeFormat("en-GB", {
    timeZone: WEATHER_TIMEZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
  const weatherTitle =
    weatherStatus === "live"
      ? `Today in ${weather.locationLabel || "your selected location"}`
      : weatherStatus === "permission"
        ? "Weather is off"
        : "Planning weather";
  const weatherCondition =
    weatherStatus === "loading"
      ? "checking forecast"
      : weatherStatus === "permission"
        ? "choose a place"
      : weatherStatus === "live"
        ? (weather.rainProbability || 0) >= 50
          ? "rain possible"
          : "dry forecast"
        : "sample conditions";
  const weatherTemperature =
    typeof weather.tempC === "number"
      ? `${Math.round(settings.temperatureUnit === "F" ? (weather.tempC * 9) / 5 + 32 : weather.tempC)}°${settings.temperatureUnit}`
      : "—";
  const weatherRain =
    typeof weather.rainProbability === "number"
      ? `${Math.round(weather.rainProbability)}%`
      : "—";
  const weatherWind =
    typeof weather.windKph === "number" ? `${Math.round(weather.windKph)} km/h` : "—";
  const weatherUv =
    typeof weather.uvIndex === "number" ? Math.round(weather.uvIndex) : "—";
  const syncLabel =
    cloudStatus === "syncing"
      ? "Syncing your wardrobe"
      : cloudStatus === "synced"
        ? "Synced privately"
        : session
          ? "Cloud sync needs attention"
          : cloudEnabled
            ? "Sign in to sync"
            : "Saved on this device";

  function notify(message) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }

  function invalidateAssistant() {
    assistantRequestId.current += 1;
    setAssistantStatus("idle");
    setAssistantResult(null);
  }

  function updateSettings(key, value) {
    setSettings((current) => ({ ...current, [key]: value }));
    if ((key === "aiEnabled" && value === false) || key === "voiceLanguage") {
      invalidateAssistant();
    }
  }

  function handleListen() {
    if (!settings.voiceEnabled) {
      notify("Turn on optional browser speech in Settings before using the microphone.");
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    const Recognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      notify("Speech recognition is not supported here. You can type your brief.");
      return;
    }

    const recognition = new Recognition();
    recognition.lang = settings.voiceLanguage;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results || [])
        .filter((result) => result.isFinal)
        .map((result) => result[0]?.transcript || "")
        .join(" ")
        .trim();
      if (!transcript) return;
      const previous = briefRef.current === defaultState.brief ? "" : briefRef.current.trim();
      const nextBrief = [previous, transcript].filter(Boolean).join(" ");
      handleBriefChange(nextBrief);
    };
    recognition.onerror = (event) => {
      setListening(false);
      recognitionRef.current = null;
      if (event.error !== "aborted" && event.error !== "no-speech") {
        notify(event.error === "not-allowed"
          ? "Microphone access was declined. Typing remains available."
          : "Speech capture stopped. You can continue by typing.");
      }
    };
    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };
    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
    } catch {
      recognitionRef.current = null;
      setListening(false);
      notify("Speech capture could not start. You can continue by typing.");
    }
  }

  function handleSpeakText(text) {
    if (!settings.voiceEnabled) {
      notify("Turn on optional browser speech in Settings before using read-aloud.");
      return;
    }
    if (!window.speechSynthesis || typeof window.SpeechSynthesisUtterance !== "function") {
      notify("Read-aloud is not supported here. The text remains available on screen.");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new window.SpeechSynthesisUtterance(text);
    utterance.lang = settings.voiceLanguage;
    window.speechSynthesis.speak(utterance);
  }

  async function requestAssistantHelp() {
    if (!settings.aiEnabled) return;
    if (brief.length > 1500) {
      setAssistantStatus("fallback");
      setAssistantResult({
        mode: "fallback",
        fields: null,
        followUpQuestion: "",
        explanation: "Shorten your brief to 1,500 characters or fewer for optional AI help.",
      });
      return;
    }
    const firstLook = visibleOutfits[0];
    if (!firstLook) {
      setAssistantStatus("fallback");
      setAssistantResult({
        mode: "fallback",
        fields: null,
        followUpQuestion: "",
        explanation: "No complete deterministic outfit is available, so AI assistance was skipped.",
      });
      return;
    }

    const requestId = ++assistantRequestId.current;
    setAssistantResult(null);
    setAssistantStatus("loading");
    try {
      if (!supabase || !session?.user) throw new Error("Sign in to use cloud AI help.");
      const { data: payload, error } = await supabase.functions.invoke("interpret-assistant", {
        body: {
          brief,
          occasion: activeDayBrief.occasion || plan,
          voiceLanguage: settings.voiceLanguage,
          weather: {
            tempC: typeof weather.tempC === "number" ? weather.tempC : null,
            rainProbability: typeof weather.rainProbability === "number" ? weather.rainProbability : null,
            windKph: typeof weather.windKph === "number" ? weather.windKph : null,
            uvIndex: typeof weather.uvIndex === "number" ? weather.uvIndex : null,
            conditionLabel: typeof weather.conditionLabel === "string" ? weather.conditionLabel.slice(0, 100) : "unknown",
            source: typeof weather.source === "string" ? weather.source.slice(0, 100) : "unknown",
            isFallback: Boolean(weather.isFallback),
          },
          candidate: {
            itemNames: firstLook.itemIds
              .map((itemId) => wardrobeById[itemId]?.name)
              .filter(Boolean)
              .slice(0, 8),
            reason: firstLook.reason.slice(0, 400),
            weather: firstLook.weather.slice(0, 300),
            formality: firstLook.formality.slice(0, 240),
          },
        },
      });
      if (error) throw error;
      if (requestId !== assistantRequestId.current) return;
      const parsed = parseAssistantResponse(payload);
      setAssistantResult(parsed);
      setAssistantStatus(parsed?.mode === "ai" ? "ready" : "fallback");
    } catch {
      if (requestId !== assistantRequestId.current) return;
      setAssistantResult({
        mode: "fallback",
        fields: null,
        followUpQuestion: "",
        explanation: "Optional AI help is unavailable; your local brief and deterministic outfit rules remain active.",
      });
      setAssistantStatus("fallback");
    }
  }

  function handlePlanNextWear() {
    setNextWearPlanReady(true);
    window.requestAnimationFrame(() => {
      document.getElementById("next-wear-plan")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    notify("Your brief is ready. Details you did not mention stay blank.");
    if (settings.aiEnabled) void requestAssistantHelp();
  }

  function updateActiveDayPlan(updater) {
    if (!activeEventId) return;
    setDayPlan((current) => updateDayPlanEvent(current, activeEventId, updater));
  }

  function clearActiveRecommendationState() {
    updateActiveDayPlan((event) => ({
      ...event,
      excludedItemSets: [],
      regenerationReason: "",
    }));
    setSwapOverrides((current) => {
      const next = { ...current };
      delete next[activeEventId];
      return next;
    });
    setSwapOutfitId(null);
  }

  function handleBriefChange(nextBrief, nextPlan = plan) {
    const nextDayPlan = parseDayPlan(nextBrief, nextPlan, dayPlan);
    const nextEventId = nextDayPlan.events.some((event) => event.id === activeEventId)
      ? activeEventId
      : nextDayPlan.events[0]?.id || "event-1";
    const nextEvent = eventStateFor(nextDayPlan, nextEventId);
    briefRef.current = nextBrief;
    setBrief(nextBrief);
    setDayPlan(nextDayPlan);
    setActiveEventId(nextEventId);
    setDayBrief(nextEvent?.dayBrief || extractDayBrief(nextBrief, nextPlan));
    setSelected(nextEvent?.selectedRecommendation || null);
    setNextWearPlanReady(false);
    setSwapOverrides({});
    setSwapOutfitId(null);
    invalidateAssistant();
  }

  function handleEventChange(eventId) {
    const nextEvent = eventStateFor(dayPlan, eventId);
    if (!nextEvent || nextEvent.id === activeEventId) return;
    setActiveEventId(nextEvent.id);
    setDayBrief(nextEvent.dayBrief);
    setSelected(nextEvent.selectedRecommendation || null);
    setSwapOutfitId(null);
    setNextWearPlanReady(false);
    invalidateAssistant();
  }

  function handleDayBriefFieldChange(key, value) {
    const nextDayBrief = { ...activeDayBrief, [key]: value };
    setDayBrief(nextDayBrief);
    updateActiveDayPlan((event) => ({
      ...event,
      dayBrief: nextDayBrief,
      excludedItemSets: [],
      regenerationReason: "",
    }));
    setNextWearPlanReady(false);
    setSwapOverrides((current) => {
      const next = { ...current };
      delete next[activeEventId];
      return next;
    });
    setSwapOutfitId(null);
    invalidateAssistant();
  }

  function handleRegenerate(reason = activeRegenerationReason || "different_items") {
    const currentSignatures = visibleOutfits.map((outfit) => itemSetKey(outfit.itemIds));
    const baseSignatures = visibleOutfits
      .map((outfit) => recommendationSet.candidates.find((candidate) => candidate.id === outfit.baseId)?.itemIds)
      .filter(Boolean)
      .map(itemSetKey);
    const signaturesToExclude = [...new Set([...currentSignatures, ...baseSignatures])];
    const alreadyAvailable = recommendationSet.candidates.some(
      (candidate) => !signaturesToExclude.includes(itemSetKey(candidate.itemIds)),
    );
    if (!alreadyAvailable) {
      notify("There are no other matching combinations yet. Add details or wardrobe pieces to replan.");
      return;
    }
    updateActiveDayPlan((event) => ({
      ...event,
      excludedItemSets: [...new Set([...(event.excludedItemSets || []), ...signaturesToExclude])],
      regenerationReason: reason,
    }));
    setShowRegenerateOptions(false);
    setSwapOutfitId(null);
    invalidateAssistant();
    notify("Showing another valid combination from your wardrobe.");
  }

  function handlePlanChange(nextPlan) {
    if (nextPlan === plan) return;
    setPlan(nextPlan);
    handleBriefChange(brief, nextPlan);
  }

  function handleReviewBrief() {
    document.getElementById("day-brief")?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.requestAnimationFrame(() => {
      document.querySelector('[aria-label="Describe what your next wear needs"]')?.focus();
    });
  }

  function handleChooseLook(outfit) {
    const nextState = selectRecommendation(
      { selected: activeSelected, wearHistory },
      outfit,
      {
        dayBrief: activeDayBrief,
        wardrobeById,
        eventId: activeEventId,
        eventLabel: activeEvent?.label || activeDayBrief.occasion,
      },
    );
    if (nextState.selected === activeSelected && nextState.wearHistory === wearHistory) {
      notify("This look is already saved for today.");
      return;
    }
    setSelected(nextState.selected);
    setWearHistory(nextState.wearHistory);
    updateActiveDayPlan((event) => ({
      ...event,
      selectedRecommendation: nextState.selected,
    }));
    invalidateAssistant();
    notify(outfit.name + " saved for today. You can add feedback in Wear history.");
  }

  function handleSwapLook(outfit, alternative) {
    setSwapOverrides((current) => ({
      ...current,
      [activeEventId]: {
        ...(current[activeEventId] || {}),
        [outfit.baseId || outfit.id]: { ...alternative, name: outfit.name },
      },
    }));
    setSwapOutfitId(null);
    const nextState = swapSelectedRecommendation(
      { selected: activeSelected, wearHistory },
      outfit,
      alternative,
      {
        dayBrief: activeDayBrief,
        wardrobeById,
        eventId: activeEventId,
        eventLabel: activeEvent?.label || activeDayBrief.occasion,
      },
    );
    if (nextState !== null && nextState !== undefined) {
      setSelected(nextState.selected);
      setWearHistory(nextState.wearHistory);
      updateActiveDayPlan((event) => ({
        ...event,
        selectedRecommendation: nextState.selected,
      }));
    }
    invalidateAssistant();
    notify(`Swapped ${wardrobeById[outfit.itemIds.find((id) => !alternative.itemIds.includes(id))]?.name || "that piece"} for a wardrobe alternative.`);
  }

  function updateHistoryFeedback(entryId, field, value) {
    setWearHistory((current) =>
      current.map((entry) =>
        entry.id === entryId
          ? { ...entry, feedback: { ...entry.feedback, [field]: value } }
          : entry,
      ),
    );
  }

  function clearWearHistory() {
    if (!wearHistory.length) return;
    if (!window.confirm("Clear all saved looks and feedback from this device? This cannot be undone.")) return;
    setWearHistory([]);
    setSelected(null);
    notify("Wear history was cleared from this device.");
  }

  function applyAssistantSuggestion(key, value) {
    if (!Object.hasOwn(assistantFieldLimits, key) || !value || activeDayBrief[key]?.trim()) return;
    handleDayBriefFieldChange(key, value);
  }

  async function handleOptionCountChange(count) {
    setOptions(count);
    if (!session?.user) return;

    try {
      await saveCloudProfile(session.user, count, profileName, { weatherPermission, weatherLocation });
      setCloudStatus("synced");
    } catch (error) {
      console.error("Wearwell option preference save failed", error);
      notify("Saved on this device, but your option preference needs another try.");
    }
  }

  function openAddItem() {
    setEditingItemId(null);
    setNewItem({ name: "", type: "Top", tone: "New", color: "#d4c4e8", note: "" });
    setShowAddItem(true);
  }

  function openItemEditor(item) {
    setEditingItemId(item.id);
    setNewItem({
      name: item.name,
      type: item.type,
      tone: item.tone || "New",
      color: item.color || "#d4c4e8",
      note: item.note || "",
    });
    setShowAddItem(true);
  }

  async function saveItem(event) {
    event.preventDefault();
    if (!newItem.name.trim()) return;

    const existingItem = wardrobe.find((item) => item.id === editingItemId);
    const localItem = {
      ...existingItem,
      ...newItem,
      id: existingItem?.id || `custom-${Date.now()}`,
      icon: existingItem?.icon || "✦",
      formality: existingItem?.formality ?? null,
      weather: existingItem?.weather || "all",
      note: newItem.note.trim() || (existingItem ? "" : "Added just now"),
    };

    setWardrobe((items) =>
      existingItem
        ? items.map((item) => (item.id === existingItem.id ? localItem : item))
        : [...items, localItem],
    );
    clearActiveRecommendationState();

    if (session?.user) {
      try {
        const savedItem = existingItem
          ? await updateCloudWardrobeItem(localItem, session.user.id)
          : await createCloudWardrobeItem(localItem, session.user.id);
        setWardrobe((items) =>
          items.map((item) => (item.id === localItem.id ? savedItem : item)),
        );
        setCloudStatus("synced");
      } catch (error) {
        console.error("Wearwell wardrobe save failed", error);
        notify("Saved on this device, but cloud sync needs another try.");
      }
    }

    setNewItem({ name: "", type: "Top", tone: "New", color: "#d4c4e8", note: "" });
    setEditingItemId(null);
    setShowAddItem(false);
    notify(existingItem ? "Your wardrobe piece was updated." : "Added to your wardrobe.");
  }

  async function removeItem() {
    const item = wardrobe.find((candidate) => candidate.id === editingItemId);
    if (!item) return;

    setWardrobe((items) => items.filter((candidate) => candidate.id !== item.id));
    clearActiveRecommendationState();
    setEditingItemId(null);
    setShowAddItem(false);

    if (session?.user) {
      try {
        await deleteCloudWardrobeItem(item);
        setCloudStatus("synced");
      } catch (error) {
        console.error("Wearwell wardrobe delete failed", error);
        notify("Removed here, but cloud deletion needs another try.");
      }
    }

    notify("Removed from your wardrobe.");
  }

  async function sendMagicLink(event) {
    event.preventDefault();
    if (!supabase || !authEmail.trim()) return;

    setAuthBusy(true);
    setAuthMessage("");
    const { error } = await supabase.auth.signInWithOtp({
      email: authEmail.trim(),
      options: { emailRedirectTo: window.location.href },
    });
    setAuthBusy(false);
    if (error) {
      setAuthMessage("We couldn't send that link. Check the address and try again.");
      return;
    }
    setAuthMessage("Check your email for a private sign-in link.");
  }

  async function saveProfile(event) {
    event.preventDefault();
    if (!session?.user) return;

    const parsedLocation = parseWeatherLocationInput(weatherLocationInput);
    if (parsedLocation.error || (weatherPermission === "granted" && !parsedLocation.location)) {
      setAuthMessage(parsedLocation.error || "Choose a city or enter latitude, longitude before allowing weather.");
      return;
    }

    setAuthBusy(true);
    setAuthMessage("");
    try {
      await saveCloudProfile(session.user, options, profileName, {
        weatherPermission,
        weatherLocation: parsedLocation.location,
      });
      setWeatherLocation(parsedLocation.location);
      setCloudStatus("synced");
      notify("Your profile and weather settings were saved.");
    } catch (error) {
      console.error("Wearwell profile save failed", error);
      notify("Your profile stays private here, but the cloud save needs another try.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function signOut() {
    if (!supabase) return;
    setAuthBusy(true);
    const { error } = await supabase.auth.signOut();
    setAuthBusy(false);
    if (error) {
      notify("We couldn't sign you out yet.");
      return;
    }
    setShowAuth(false);
    notify("You are signed out. This device still has its local copy.");
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark">w</div>
          <div>
            <div className="brand-name">wearwell</div>
            <div className="brand-tagline">your wardrobe, understood</div>
          </div>
        </div>

        <button className="profile-chip" onClick={() => setShowAuth(true)}>
          <div className="avatar">{session ? accountInitial : "w"}</div>
          <div>
            <strong>{session ? `Good morning, ${accountName}` : "Good morning"}</strong>
            <span>{syncLabel}</span>
          </div>
          <Icon>⌄</Icon>
        </button>

        <nav className="primary-nav" aria-label="Primary navigation">
          <button className={activeTab === "today" ? "nav-item active" : "nav-item"} onClick={() => setActiveTab("today")}>
            <Icon>◌</Icon><span>Today</span><em>{visibleOutfits.length}</em>
          </button>
          <button className={activeTab === "wardrobe" ? "nav-item active" : "nav-item"} onClick={() => setActiveTab("wardrobe")}>
            <Icon>▦</Icon><span>My wardrobe</span>
          </button>
          <button className={activeTab === "history" ? "nav-item active" : "nav-item"} onClick={() => setActiveTab("history")}>
            <Icon>↺</Icon><span>Wear history</span>
          </button>
        </nav>

        <div className="sidebar-rule" />
        <button className={activeTab === "settings" ? "nav-item active" : "nav-item"} onClick={() => setActiveTab("settings")}>
          <Icon>⚙</Icon><span>Settings</span>
        </button>
        <div className="sidebar-footer">
          <div className="mini-sun">☼</div>
          <div><strong>Small choices, more use</strong><span>Wear what you own, well.</span></div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb"><span>{todayLabel}</span><i>·</i><span className="muted-text">A considered start</span></div>
          <div className="topbar-actions">
            <button className="icon-button" aria-label="Notifications" onClick={() => notify("You have no new notifications.")}>♧</button>
            <button className="help-button" onClick={() => notify("Wearwell is built to ask, not assume.")}>?</button>
          </div>
        </header>

        {activeTab === "today" && (
          <section className="today-view">
            <div className="welcome-row">
              <div>
                <p className="eyebrow">YOUR DAY, IN CLOTHES</p>
                <h1>What’s the day asking of you?</h1>
                <p className="lede">Tell me what your next wear needs, how you’re feeling, and I’ll work from there.</p>
              </div>
              <div className="weather-card">
                <div className="weather-heading"><span>{weatherTitle}</span><Icon>↗</Icon></div>
                <div className="weather-main"><span className="weather-symbol">{weatherStatus === "permission" ? "⌖" : weatherCondition === "rain possible" ? "☂" : "☀"}</span><strong>{weatherTemperature}</strong><span className="weather-label">{weatherCondition}</span></div>
                <div className="weather-stats"><span><b>{weatherRain}</b> rain</span><span><b>{weatherWind}</b> wind</span><span><b>{weatherUv}</b> UV</span></div>
                <div className="weather-label" title={weather.uncertainty}>{weather.source}</div>
                {weatherStatus === "permission" && <button type="button" className="text-button" onClick={() => setShowAuth(true)}>Set up weather <Icon>→</Icon></button>}
              </div>
            </div>

            <div className="brief-grid" id="day-brief">
              <div className="brief-panel">
                <div className="panel-label"><span className="status-dot" /> YOUR BRIEF <span className="save-hint">saved privately</span></div>
                 <div className="brief-input-wrap">
                   <textarea value={brief} onChange={(event) => handleBriefChange(event.target.value)} aria-label="Describe what your next wear needs" />
                  <button type="button" className={listening ? "voice-button listening" : "voice-button"} onClick={handleListen} aria-pressed={listening} aria-label={listening ? "Stop speaking your brief" : "Speak your brief"} title={settings.voiceEnabled ? "Speak your brief" : "Enable browser speech in Settings"}>
                    <span className="voice-ring" />
                    {listening ? "•••" : "◉"}
                  </button>
                </div>
                <div className="speech-actions">
                  <button type="button" className="text-button" onClick={() => handleSpeakText(brief)} disabled={!settings.voiceEnabled || !brief.trim()}>Read brief aloud</button>
                  {!settings.voiceEnabled && <span>Enable optional browser speech in Settings.</span>}
                </div>
                {settings.voiceEnabled && <p className="voice-privacy-note">Optional browser speech may be processed by your browser or operating system. Review the transcript; audio is not saved by Wearwell.</p>}
                <div className="brief-bottom">
                  <div className="quick-prompts">
                    <span>Try:</span>
                    {plans.slice(0, 4).map((item) => <button key={item} onClick={() => handlePlanChange(item)} className={plan === item ? "prompt active" : "prompt"}>{item}</button>)}
                  </div>
                  <button className="understand-button" onClick={handlePlanNextWear}>{nextWearPlanReady ? "Next wear plan ready" : "Plan my next wear"} <Icon>→</Icon></button>
                </div>
              </div>
              <div className="plan-panel">
                <div className="panel-label">I’M DRESSING FOR <span className="edit-pill">edit</span></div>
                <div className="quick-prompts" aria-label="Events in this day plan">
                  <span>Events:</span>
                  {dayPlan.events.map((event) => (
                    <button
                      key={event.id}
                      type="button"
                      className={event.id === activeEventId ? "prompt active" : "prompt"}
                      onClick={() => handleEventChange(event.id)}
                    >
                      {event.dayBrief.occasion || event.label}
                    </button>
                  ))}
                </div>
                <div className="plan-title-row"><strong>{activeDayBrief.occasion || "Choose an occasion"}</strong><span className="confidence">selected by you <Icon>✓</Icon></span></div>
                <div className="structured-brief-fields" aria-label="Editable day brief">
                   {dayBriefFields.map(({ key, label }) => <label className="structured-brief-field" key={key}><span>{label}</span><input type="text" value={activeDayBrief[key] || ""} placeholder="Not specified" onChange={(event) => handleDayBriefFieldChange(key, event.target.value)} /></label>)}
                </div>
                <p className="structured-brief-note">Only stated details are filled. The occasion comes from your selection; edit any field or leave it blank.</p>
              </div>
            </div>

            {assistantStatus !== "idle" && (
              <section className="assistant-note" aria-live="polite">
                <div>
                  <strong>{assistantStatus === "loading" ? "Reviewing your brief…" : assistantStatus === "ready" ? "Optional suggestions to review" : "AI help unavailable"}</strong>
                  <p>{assistantStatus === "loading" ? "The deterministic outfit remains in control while optional suggestions load." : assistantResult?.explanation}</p>
                  {assistantResult?.followUpQuestion && <p className="assistant-question">{assistantResult.followUpQuestion}</p>}
                  {assistantResult?.fields && (
                    <ul className="assistant-suggestions">
                      {dayBriefFields
                        .filter(({ key }) => assistantResult.fields[key] && !activeDayBrief[key]?.trim())
                        .map(({ key }) => (
                          <li key={key}>
                            <span><b>{assistantFieldLabels[key]}:</b> {assistantResult.fields[key]}</span>
                            <button type="button" className="text-button" onClick={() => applyAssistantSuggestion(key, assistantResult.fields[key])}>Use suggestion</button>
                          </li>
                        ))}
                    </ul>
                  )}
                </div>
                <button type="button" className="close-button assistant-dismiss" aria-label="Dismiss AI suggestions" onClick={() => { setAssistantStatus("idle"); setAssistantResult(null); }}>×</button>
              </section>
            )}

             <div className="recommendation-header" id="next-wear-plan">
               <div><p className="eyebrow">YOUR NEXT WEAR, FROM YOUR WARDROBE</p><h2>Looks built from your wardrobe</h2>{activeRegenerationReason && <p className="recommendation-context">Showing a different approach: {regenerationReasons.find(([value]) => value === activeRegenerationReason)?.[1] || "different items"}.</p>}</div>
               <div className="recommendation-controls"><span>{visibleOutfits.length} {visibleOutfits.length === 1 ? "look" : "looks"} ready</span><div className="segmented">{[2, 3].map((count) => <button key={count} className={options === count ? "selected" : ""} onClick={() => handleOptionCountChange(count)}>{count}</button>)}</div><div className="regenerate-wrap"><button className="regenerate-link" onClick={() => setShowRegenerateOptions((current) => !current)} aria-expanded={showRegenerateOptions}><Icon>↻</Icon> regenerate</button>{showRegenerateOptions && <div className="regenerate-menu" role="menu"><p>What should change?</p>{regenerationReasons.map(([value, label]) => <button type="button" key={value} role="menuitem" onClick={() => handleRegenerate(value)}>{label}</button>)}</div>}</div></div>
            </div>

            <div className="outfit-grid">
              {visibleOutfits.length === 0 ? (
                <div className="outfit-empty" role="status">
                  <p className="eyebrow">{recommendationSet.generatedCount > 0 ? "REPLAN YOUR NEXT WEAR" : "A WARDROBE FOUNDATION"}</p>
                   <h3>{recommendationSet.generatedCount > 0 ? (activeExcludedItemSets.length ? "No other valid combination yet" : "No looks match the details recorded") : "No complete combination yet"}</h3>
                   <p>{recommendationSet.generatedCount > 0
                     ? (activeExcludedItemSets.length
                       ? "Wearwell kept the previous combinations and could not find another wardrobe set that clears the same recorded constraints."
                       : "The available combinations conflict with a stated need or are marked unavailable. Review your brief or item details; missing details are never treated as a match or a mismatch.")
                    : "Add a top and a bottom, or a one-piece item. Layers, shoes, and accessories are optional."}</p>
                  {recommendationSet.generatedCount > 0
                    ? <button className="understand-button" onClick={handleReviewBrief}>Review my brief <Icon>→</Icon></button>
                    : <button className="understand-button" onClick={() => { setActiveTab("wardrobe"); openAddItem(); }}>Add a wardrobe piece <Icon>→</Icon></button>}
                </div>
               ) : visibleOutfits.map((outfit, index) => (
                 <article className={activeSelected === outfit.id ? "outfit-card chosen" : "outfit-card"} key={outfit.baseId || outfit.id}>
                  <div className="outfit-visual">
                    <div className="option-index">0{index + 1}</div>
                    <div className="outfit-figure">
                      {outfit.itemIds.slice(0, 3).map((itemId, itemIndex) => {
                        const item = wardrobeById[itemId];
                        return <div key={itemId} className={"garment garment-" + itemIndex} style={{ "--garment-color": item?.color || "#ddd" }}><span>{item?.icon}</span></div>;
                      })}
                    </div>
                    <div className="palette">{outfit.palette.map((color) => <span key={color} style={{ background: color }} />)}</div>
                    <span className="level-tag">{outfit.level}</span>
                  </div>
                  <div className="outfit-body">
                    <div className="outfit-title"><h3>{outfit.name}</h3>{activeSelected === outfit.id && <span className="chosen-mark">chosen <Icon>✓</Icon></span>}</div>
                    <p>{outfit.reason}</p>
                    {settings.voiceEnabled && <button type="button" className="text-button outfit-speak" onClick={() => handleSpeakText(`${outfit.name}. ${outfit.reason} ${outfit.weather} ${outfit.formality}`)}>Listen to this explanation</button>}
                    <div className="outfit-meta"><span><Icon>☼</Icon>{outfit.weather}</span><span><Icon>◒</Icon>{outfit.formality}</span></div>
                    <div className="item-list">{outfit.itemIds.map((itemId) => { const item = wardrobeById[itemId]; return <span key={itemId}><i style={{ background: item?.color }} />{item?.name}</span>; })}</div>
                     <div className="outfit-details">
                       <p><strong>Footwear</strong>{outfit.footwear}</p>
                       <p><strong>Accessories</strong>{outfit.accessories}</p>
                       <p><strong>If uncomfortable</strong>{outfit.ifUncomfortable?.[0]}</p>
                       <p><strong>Fewer items</strong>{outfit.cheaperOrFewerItems}</p>
                       {outfit.substitutions?.length > 0 && <div><strong>Substitutions</strong><ul>{outfit.substitutions.map(({ candidateId, replaceItemId, withItemId, reason }) => <li key={`${replaceItemId}-${withItemId}`}><button type="button" className="inline-swap" onClick={() => handleSwapLook(outfit, recommendationSet.candidates.find((candidate) => candidate.id === candidateId) || outfit)}>{reason}</button></li>)}</ul></div>}
                     </div>
                     <div className="outfit-actions"><button className="choose-button" onClick={() => handleChooseLook(outfit)}>{activeSelected === outfit.id ? "Saved for today" : "Choose this look"} <Icon>→</Icon></button><button className="swap-button" onClick={() => setSwapOutfitId((current) => current === (outfit.baseId || outfit.id) ? null : (outfit.baseId || outfit.id))} aria-expanded={swapOutfitId === (outfit.baseId || outfit.id)}><Icon>↝</Icon> swap a piece</button></div>
                     {swapOutfitId === (outfit.baseId || outfit.id) && <div className="swap-panel"><strong>Choose a replacement from your wardrobe</strong>{swapOptionsFor(outfit, swapRecommendationSet.candidates).slice(0, 6).length > 0 ? swapOptionsFor(outfit, swapRecommendationSet.candidates).slice(0, 6).map(({ candidate, removedId, addedId }) => <button type="button" key={`${outfit.id}-${candidate.id}`} onClick={() => handleSwapLook(outfit, candidate)}><span>{wardrobeById[removedId]?.name || "Current piece"}</span><Icon>→</Icon><span>{wardrobeById[addedId]?.name || "Wardrobe piece"}</span></button>) : <p>No compatible wardrobe replacement clears the recorded constraints for this look.</p>}</div>}
                  </div>
                </article>
              ))}
            </div>
            <div className="learning-note"><Icon>✦</Icon><span>Wearwell learns from what you choose — not from assumptions. <button onClick={() => notify("Only your explicit feedback is used to refine future suggestions.")}>How it works <Icon>↗</Icon></button></span></div>
          </section>
        )}

        {activeTab === "wardrobe" && (
          <section className="wardrobe-view">
             <div className="view-heading"><div><p className="eyebrow">YOUR CLOSET, MADE USEFUL</p><h1>My wardrobe</h1><p className="lede">These are the pieces Wearwell can work with today.</p></div><button className="understand-button" onClick={openAddItem}><Icon>+</Icon> Add a piece</button></div>
            <div className="wardrobe-summary"><div><strong>{wardrobe.length}</strong><span>pieces added</span></div><div><strong>3</strong><span>looks ready today</span></div><div><strong>2</strong><span>needs more detail</span></div></div>
             <div className="wardrobe-grid">{wardrobe.map((item) => <div className="wardrobe-item" key={item.id}><div className="wardrobe-swatch" style={{ "--item-color": item.color }}><span>{item.icon}</span></div><div><span className="item-type">{item.type}</span><h3>{item.name}</h3><p>{item.note}</p></div><button className="more-button" onClick={() => openItemEditor(item)} aria-label={`Edit ${item.name}`}>···</button></div>)}</div>
             {showAddItem && <div className="modal-backdrop" onClick={() => setShowAddItem(false)}><form className="modal" onSubmit={saveItem} onClick={(event) => event.stopPropagation()}><div className="modal-header"><div><p className="eyebrow">{editingItemId ? "EDIT YOUR WARDROBE" : "ADD TO YOUR WARDROBE"}</p><h2>{editingItemId ? "Keep the details current" : "A piece you reach for"}</h2></div><button type="button" className="close-button" onClick={() => setShowAddItem(false)}>×</button></div><label>Name<input autoFocus value={newItem.name} onChange={(event) => setNewItem({ ...newItem, name: event.target.value })} placeholder="e.g. navy cotton shirt" /></label><div className="form-row"><label>Type<select value={newItem.type} onChange={(event) => setNewItem({ ...newItem, type: event.target.value })}><option>Top</option><option>Bottom</option><option>Layer</option><option>Shoes</option><option>Accessory</option></select></label><label>Colour<input type="color" value={newItem.color} onChange={(event) => setNewItem({ ...newItem, color: event.target.value })} /></label></div><label>Fit & comfort note (optional)<textarea value={newItem.note} onChange={(event) => setNewItem({ ...newItem, note: event.target.value })} placeholder="e.g. soft fabric, room to move" rows="3" /></label><div className="modal-actions">{editingItemId && <button type="button" className="danger-button" onClick={removeItem}>Remove</button>}<button className="understand-button">{editingItemId ? "Save changes" : "Add piece"} <Icon>→</Icon></button></div></form></div>}
          </section>
        )}

        {activeTab === "history" && (
          <section className="history-view">
            <div className="view-heading">
              <div><p className="eyebrow">WHAT HAS WORKED</p><h1>Wear history</h1><p className="lede">A small record of looks you chose and the feedback you gave.</p></div>
              {wearHistory.length > 0 && <button type="button" className="danger-button" onClick={clearWearHistory}>Clear history</button>}
            </div>
            {wearHistory.length === 0 ? (
              <div className="empty-history">
                <div className="history-orbit">↺</div>
                <h2>Your saved looks will live here.</h2>
                <p>Choose a look from Today, then add only the feedback you want to share. Nothing is inferred when you leave a question unanswered.</p>
                <button className="understand-button" onClick={() => setActiveTab("today")}>Back to today <Icon>→</Icon></button>
              </div>
            ) : (
              <div className="history-list">
                {[...wearHistory].reverse().map((entry) => (
                  <article className="history-entry" key={entry.id}>
                    <div className="history-entry-heading">
                      <div><p className="eyebrow">{formatHistoryDate(entry.createdAt)}</p><h2>{entry.outfitName}</h2></div>
                      <span className="history-status">{entry.feedback.woreIt === "yes" ? "Worn" : entry.feedback.woreIt === "not-yet" ? "Not worn yet" : "Saved look"}</span>
                    </div>
                    <div className="item-list history-items">{entry.itemNames.map((name, index) => <span key={`${entry.itemIds[index]}-${index}`}>{name}</span>)}</div>
                    {entry.reason && <p className="history-reason">{entry.reason}</p>}
                    <div className="history-feedback">
                      {feedbackFields.map(({ key, label, options: values }) => (
                        <label key={key}>
                          <span>{label}</span>
                          <select
                            aria-label={`${label} feedback for ${entry.outfitName}`}
                            value={entry.feedback[key] || ""}
                            onChange={(event) => updateHistoryFeedback(entry.id, key, event.target.value)}
                          >
                            {values.map(([value, optionLabel]) => <option value={value} key={value || "empty"}>{optionLabel}</option>)}
                          </select>
                        </label>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            )}
            <p className="history-privacy-note">{session ? "This history and its feedback are synced to your private account and kept on this device too. You can clear them here." : cloudEnabled ? "This history and its feedback stay in this browser until you sign in. You can clear them here." : "This history and its feedback stay in this browser. You can clear them here."}</p>
          </section>
        )}

        {activeTab === "settings" && (
          <section className="settings-view">
            <div className="view-heading"><div><p className="eyebrow">YOUR CHOICES, YOURS TO CHANGE</p><h1>Settings</h1><p className="lede">Speech and AI assistance are optional. Typing and deterministic recommendations always remain available.</p></div></div>
            <div className="settings-grid">
              <section className="setting-card">
                <p className="eyebrow">SPEECH</p>
                <h2>Browser speech</h2>
                <label className="setting-toggle">
                  <input type="checkbox" checked={settings.voiceEnabled} onChange={(event) => updateSettings("voiceEnabled", event.target.checked)} />
                  <span>Enable speech input and read-aloud</span>
                </label>
                <label className="setting-field">Speech language
                  <select value={settings.voiceLanguage} onChange={(event) => updateSettings("voiceLanguage", event.target.value)} disabled={!settings.voiceEnabled}>
                    <option value="en-GB">English (UK)</option>
                    <option value="en-US">English (US)</option>
                    <option value="fr-FR">Français</option>
                    <option value="pt-PT">Português</option>
                    <option value="es-ES">Español</option>
                  </select>
                </label>
                <p>Speech recognition and read-aloud use browser or operating-system services when available. Audio is not saved by Wearwell; you can review and edit any transcript before using it.</p>
              </section>
              <section className="setting-card">
                <p className="eyebrow">OPTIONAL AI</p>
                <h2>Brief suggestions</h2>
                <label className="setting-toggle">
                  <input type="checkbox" checked={settings.aiEnabled} onChange={(event) => updateSettings("aiEnabled", event.target.checked)} />
                  <span>Allow optional AI suggestions when I press “Plan my next wear”</span>
                </label>
                <p>Only then, Wearwell sends your brief, selected occasion, weather summary, and the first deterministic look summary/item names to its server. It does not send audio, account details, or wear history. Suggestions never choose or change outfits; you review each one before applying it.</p>
                <p className="setting-note">Without this setting, planning stays local. If the server or model is unavailable, deterministic recommendations continue to work.</p>
              </section>
              <section className="setting-card">
                <p className="eyebrow">DISPLAY</p>
                <h2>Temperature</h2>
                <label className="setting-field">Show weather in
                  <select value={settings.temperatureUnit} onChange={(event) => updateSettings("temperatureUnit", event.target.value)}>
                    <option value="C">Celsius</option>
                    <option value="F">Fahrenheit</option>
                  </select>
                </label>
                <p>This changes the displayed temperature only; Wearwell keeps its stored weather values in Celsius for recommendation scoring.</p>
              </section>
            </div>
          </section>
        )}
      </main>
      {toast && <div className="toast"><Icon>✦</Icon>{toast}</div>}
      {showAuth && <div className="modal-backdrop" onClick={() => setShowAuth(false)}><form className="modal auth-modal" onSubmit={sendMagicLink} onClick={(event) => event.stopPropagation()}><div className="modal-header"><div><p className="eyebrow">YOUR PRIVATE WARDROBE</p><h2>{session ? "Your account is connected" : "Save your wardrobe everywhere"}</h2></div><button type="button" className="close-button" onClick={() => setShowAuth(false)}>×</button></div>{session ? <><p className="modal-note">Your account is connected. Add only the name you want Wearwell to use; it is not required for recommendations.</p><label>Name (optional)<input autoFocus value={profileName} onChange={(event) => setProfileName(event.target.value)} placeholder="What should Wearwell call you?" /></label><label>Weather permission<select value={weatherPermission} onChange={(event) => setWeatherPermission(event.target.value)}><option value="not_asked">Not set up</option><option value="granted">Allow forecasts for my chosen place</option><option value="denied">Keep weather off</option></select></label><p className="modal-note">Weather is optional. Choose a city or enter coordinates like -15.4167, 28.2833. Wearwell does not use browser location.</p><label>Forecast location (optional)<input value={weatherLocationInput} onChange={(event) => setWeatherLocationInput(event.target.value)} placeholder="e.g. Lusaka or -15.4167, 28.2833" /></label>{authMessage && <p className="auth-message">{authMessage}</p>}<button type="button" className="understand-button full-width" onClick={saveProfile} disabled={authBusy}>{authBusy ? "Saving…" : "Save profile"} <Icon>→</Icon></button><button type="button" className="text-button full-width" onClick={signOut} disabled={authBusy}>{authBusy ? "Signing out…" : "Sign out"} <Icon>→</Icon></button></> : <><p className="modal-note">Use a magic link to sync your wardrobe across sessions. Wearwell does not need social profile data.</p><label>Email<input autoFocus type="email" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} placeholder="you@example.com" required /></label>{authMessage && <p className="auth-message">{authMessage}</p>}<button className="understand-button full-width" disabled={authBusy}>{authBusy ? "Sending…" : "Send magic link"} <Icon>→</Icon></button></>}</form></div>}
    </div>
  );
}


export default App;
