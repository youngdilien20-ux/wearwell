import { useEffect, useMemo, useRef, useState } from "react";
import { extractDayBrief } from "./dayBrief.mjs";
import { transcriptFromRecognitionResults } from "./speechRecognition.mjs";
import { speechVoiceId, speechVoiceOptionsForLanguage } from "./speechVoices.mjs";
import { scoreOutfitCandidates } from "./outfitScoring.mjs";
import { buildWardrobeGapPlan } from "./wardrobeGapPlanning.mjs";
import WardrobeGapAssistant from "./WardrobeGapAssistant.jsx";
import {
  ASSISTANT_FIELD_LIMITS,
  ASSISTANT_INTERVIEW_FIELD_KEYS as assistantChatFieldKeys,
  ASSISTANT_INTERVIEW_FIELD_LIMITS as assistantChatFieldLimits,
  buildAssistantConversationFromBrief,
  buildAssistantConversationFromMessages,
  buildAssistantRequestPayload,
  classifyAssistantFollowUp,
  classifyRecommendationIntent,
  normalizeAssistantInterviewAnswers as assistantChatValues,
  parseAssistantResponse,
} from "./assistantPlanning.mjs";
import {
  restoreSelectedRecommendation,
  selectRecommendation,
  swapOptionsFor,
  swapSelectedRecommendation,
} from "./selectionState.mjs";
import {
  applyWardrobeVisionSuggestion,
  buildWardrobeItemRecord,
  imageBlobToBase64,
  prepareWardrobePhoto,
  validateWardrobePhotoFile,
} from "./wardrobeCapture.mjs";
import {
  normalizeWardrobeVisualAttributes,
  normalizeWardrobeVisionResult,
} from "../supabase/functions/_shared/wardrobe-vision.js";
import {
  eventStateFor,
  normalizeDayPlan,
  parseDayPlan,
  updateDayPlanEvent,
} from "./dayPlan.mjs";
import AuthModal from "./AuthModal";
import "./styles.css";
import {
  createCloudWardrobeItem,
  deleteCloudWardrobeItem,
  listCloudWardrobeItems,
  loadCloudProfile,
  saveCloudProfile,
  setCloudWardrobeClient,
  updateCloudWardrobeItem,
} from "./cloudWardrobe";
import {
  loadCloudAppState,
  saveCloudAppState,
  setCloudStateClient,
} from "./cloudState";
import { readLocalState, writeLocalState } from "./storage";
import { cloudEnabled, supabase } from "./supabase";
import { getBrowserLocation } from "./geolocation.mjs";
import {
  cancelNotificationJob,
  cancelNotificationJobsByKind,
  createLiveWeatherWatch,
  createSavedLookReminder,
  getBrowserPushStatus,
  loadNotificationJobs,
  markNotificationJobsRead,
  registerBrowserPushDevice,
  removeBrowserPushDevice,
} from "./notificationClient";
import ProfileSettings from "./ProfileSettings";
import { EMPTY_PROFILE_DETAILS, normalizeProfileDetails } from "./profile.mjs";
import {
  FALLBACK_WEATHER,
  WEATHER_PERMISSION_REQUIRED,
  getDefaultWeatherQuery,
  getWeatherContext,
  WEATHER_TIMEZONE,
} from "./weather";

setCloudStateClient(supabase);
setCloudWardrobeClient(supabase);

function formatWeatherLocation(location) {
  if (typeof location?.city === "string") return location.city;
  if (Number.isFinite(location?.latitude) && Number.isFinite(location?.longitude)) {
    return `${location.latitude}, ${location.longitude}`;
  }
  return "";
}

function getAuthRedirectUrl() {
  return `${window.location.origin}${window.location.pathname}`;
}

function itemSetKey(itemIds) {
  return Array.isArray(itemIds) ? itemIds.slice().sort().join("\u001f") : "";
}

function emptyWardrobeDraft() {
  return {
    name: "",
    type: "Top",
    tone: "",
    color: "#d4c4e8",
    note: "",
    formality: null,
    formalityExplicit: false,
    weather: "all",
    visualAttributes: { pattern: "uncertain", visibleDetails: "" },
  };
}

const plans = ["Work", "Walk", "Shopping", "Church", "Friends"];
const defaultState = {
  wardrobe: [],
  plan: "Work",
  brief: "",
  options: 3,
  selected: null,
  dayBrief: extractDayBrief("", "Work"),
  settings: {
    temperatureUnit: "C",
    voiceLanguage: "en-GB",
    voiceEnabled: true,
    aiEnabled: true,
    profileReminderDismissed: false,
    shareProfileWithAi: true,
    savedLookRemindersEnabled: false,
    weatherAlertsEnabled: false,
  },
  profileDetails: EMPTY_PROFILE_DETAILS,
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

function formatHistoryDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Date not recorded";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function dateTimeInputValue(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultReminderDateTime() {
  const date = new Date();
  date.setMinutes(Math.ceil((date.getMinutes() + 30) / 5) * 5, 0, 0);
  return dateTimeInputValue(date);
}

function formatNotificationTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Time not recorded";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function notificationKindLabel(kind) {
  return kind === "weather_change" ? "Live forecast change" : "Saved-look reminder";
}

function notificationJobMessage(job) {
  if (typeof job.payload?.body === "string") return job.payload.body;
  if (job.kind === "weather_change") return "The live forecast changed for a saved look.";
  return "A reminder for a saved look is ready.";
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
      legacySelected: restoreSelectedRecommendation(savedState),
    }),
    [savedState],
  );
  const [activeTab, setActiveTab] = useState("today");
  const [wardrobe, setWardrobe] = useState(() => savedState.wardrobe);
  const [brief, setBrief] = useState(() => savedState.brief);
  const [dayPlan, setDayPlan] = useState(() => initialDayPlan);
  const [options, setOptions] = useState(() => savedState.options);
  const [listening, setListening] = useState(false);
  const [speechPreview, setSpeechPreview] = useState("");
  const [voiceConversationMode, setVoiceConversationMode] = useState(false);
  const [voiceConversationStatus, setVoiceConversationStatus] = useState("idle");
  const [availableSpeechVoices, setAvailableSpeechVoices] = useState([]);
  const [settings, setSettings] = useState(() => savedState.settings);
  const [profileDetails, setProfileDetails] = useState(
    () => savedState.profileDetails || EMPTY_PROFILE_DETAILS,
  );
  const [profileBusy, setProfileBusy] = useState(false);
  const [wearHistory, setWearHistory] = useState(() => savedState.wearHistory);
  const [toast, setToast] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const [notificationJobs, setNotificationJobs] = useState([]);
  const [notificationLoadStatus, setNotificationLoadStatus] = useState("idle");
  const [notificationError, setNotificationError] = useState("");
  const [notificationPanelOpen, setNotificationPanelOpen] = useState(false);
  const [pushStatus, setPushStatus] = useState("checking");
  const [pushBusy, setPushBusy] = useState(false);
  const [reminderEntry, setReminderEntry] = useState(null);
  const [reminderDateTime, setReminderDateTime] = useState("");
  const [reminderBusy, setReminderBusy] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);
  const [editingItemId, setEditingItemId] = useState(null);
  const [newItem, setNewItem] = useState(emptyWardrobeDraft);
  const [draftTouchedFields, setDraftTouchedFields] = useState(() => new Set());
  const [wardrobePhotoOpen, setWardrobePhotoOpen] = useState(false);
  const [wardrobePhotoFile, setWardrobePhotoFile] = useState(null);
  const [wardrobePhotoPreview, setWardrobePhotoPreview] = useState("");
  const [wardrobePhotoBusy, setWardrobePhotoBusy] = useState(false);
  const [wardrobePhotoError, setWardrobePhotoError] = useState("");
  const [wardrobePhotoSuggestion, setWardrobePhotoSuggestion] = useState(null);
  const [wardrobePhotoSuggestionsApplied, setWardrobePhotoSuggestionsApplied] = useState(false);
  const wardrobeCameraInputRef = useRef(null);
  const wardrobeUploadInputRef = useRef(null);
  const wardrobePhotoAbortRef = useRef(null);
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(!cloudEnabled);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authPasswordConfirmation, setAuthPasswordConfirmation] = useState("");
  const [authMode, setAuthMode] = useState("sign_in");
  const [profileName, setProfileName] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [locationBusy, setLocationBusy] = useState(false);
  const [locationMessage, setLocationMessage] = useState("");
  const locationRequestInFlightRef = useRef(false);
  const [cloudStatus, setCloudStatus] = useState(cloudEnabled ? "checking" : "local");
  const [weather, setWeather] = useState(() => FALLBACK_WEATHER);
  const [weatherStatus, setWeatherStatus] = useState(cloudEnabled ? "checking" : "fallback");
  const [weatherPermission, setWeatherPermission] = useState("not_asked");
  const [weatherLocation, setWeatherLocation] = useState(null);
  const [showRegenerateOptions, setShowRegenerateOptions] = useState(false);
  const [swapOutfitId, setSwapOutfitId] = useState(null);
  const [swapOverrides, setSwapOverrides] = useState({});
  const [assistantStatus, setAssistantStatus] = useState("idle");
  const [assistantResult, setAssistantResult] = useState(null);
  const [assistantInputRevision, setAssistantInputRevision] = useState(0);
  const [assistantFollowUpDraft, setAssistantFollowUpDraft] = useState("");
  const [assistantLastQuestion, setAssistantLastQuestion] = useState("");
  const [assistantChatOpen, setAssistantChatOpen] = useState(false);
  const [assistantChatMessages, setAssistantChatMessages] = useState([]);
  const [assistantChatDraft, setAssistantChatDraft] = useState("");
  const [assistantChatBusy, setAssistantChatBusy] = useState(false);
  const [assistantChatError, setAssistantChatError] = useState("");
  const [assistantChatAnswers, setAssistantChatAnswers] = useState({});
  const [assistantChatResolvedFields, setAssistantChatResolvedFields] = useState([]);
  const [assistantChatCurrentField, setAssistantChatCurrentField] = useState(null);
  const [assistantChatComplete, setAssistantChatComplete] = useState(false);
  const [assistantChatFallback, setAssistantChatFallback] = useState(false);
  const helpButtonRef = useRef(null);
  const helpPanelRef = useRef(null);
  const recognitionRef = useRef(null);
  const speechTranscriptRef = useRef("");
  const speechTargetRef = useRef("idle");
  const voiceConversationModeRef = useRef(false);
  const voiceListenTimerRef = useRef(null);
  const assistantSpeechRequestRef = useRef(0);
  const spokenAssistantMessageRef = useRef("");
  const spokenAssistantErrorRef = useRef("");
  const pendingVoiceReplyRef = useRef("");
  const briefRef = useRef(brief);
  const assistantRequestId = useRef(0);
  const assistantChatRequestId = useRef(0);
  const assistantChatLogRef = useRef(null);
  const assistantFollowUpRef = useRef("");
  const cloudStateHydratedRef = useRef(false);
  const activeEventId = dayPlan.activeEventId || dayPlan.events?.[0]?.id || "event-1";
  const activeEvent = eventStateFor(dayPlan, activeEventId);
  const dayBrief = activeEvent?.dayBrief || savedState.dayBrief;
  const plan = dayBrief.occasion || savedState.plan;
  const selected = activeEvent?.selectedRecommendation || null;
  const regenerationReason = activeEvent?.regenerationReason || "";
  const excludedItemSets = activeEvent?.excludedItemSets || [];
  const activeSwapOverrides = swapOverrides[activeEventId] || {};
  const speechVoiceOptions = useMemo(
    () => speechVoiceOptionsForLanguage(
      availableSpeechVoices,
      settings.voiceLanguage,
      settings.speechVoiceId,
    ),
    [availableSpeechVoices, settings.voiceLanguage, settings.speechVoiceId],
  );

  useEffect(() => {
    if (!helpOpen) return undefined;

    const panel = helpPanelRef.current;
    panel?.querySelector("[data-help-close]")?.focus();

    function handleOutsidePointer(event) {
      if (
        !panel?.contains(event.target) &&
        !helpButtonRef.current?.contains(event.target)
      ) {
        setHelpOpen(false);
      }
    }

    function handleHelpKeyDown(event) {
      if (event.key === "Escape") {
        setHelpOpen(false);
        helpButtonRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handleOutsidePointer);
    document.addEventListener("keydown", handleHelpKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointer);
      document.removeEventListener("keydown", handleHelpKeyDown);
    };
  }, [helpOpen]);

  useEffect(() => {
    const log = assistantChatLogRef.current;
    if (assistantChatOpen && log) log.scrollTop = log.scrollHeight;
  }, [assistantChatMessages, assistantChatBusy, assistantChatOpen]);

  useEffect(() => {
    const synthesis = window.speechSynthesis;
    if (!synthesis) return undefined;

    const refreshVoices = () => setAvailableSpeechVoices(synthesis.getVoices());
    refreshVoices();

    if (typeof synthesis.addEventListener === "function") {
      synthesis.addEventListener("voiceschanged", refreshVoices);
      return () => synthesis.removeEventListener("voiceschanged", refreshVoices);
    }

    const previousHandler = synthesis.onvoiceschanged;
    const handleVoicesChanged = (event) => {
      previousHandler?.call(synthesis, event);
      refreshVoices();
    };
    synthesis.onvoiceschanged = handleVoicesChanged;
    return () => {
      if (synthesis.onvoiceschanged === handleVoicesChanged) {
        synthesis.onvoiceschanged = previousHandler;
      }
    };
  }, []);

  useEffect(() => {
    if (!voiceConversationMode || assistantChatBusy) return undefined;

    if (assistantChatError) {
      const errorKey = `${assistantChatMessages.length}\u001f${assistantChatError}`;
      if (spokenAssistantErrorRef.current === errorKey) return undefined;
      spokenAssistantErrorRef.current = errorKey;
      speakVoicePrompt(
        `${assistantChatError} Say “try again” to retry, or turn off voice chat to type.`,
        scheduleVoiceChatListening,
      );
      return undefined;
    }

    const assistantMessageIndex = assistantChatMessages.reduce(
      (lastIndex, message, index) => message.role === "assistant" ? index : lastIndex,
      -1,
    );
    if (assistantMessageIndex < 0) return undefined;

    const assistantMessage = assistantChatMessages[assistantMessageIndex];
    const messageKey = `${assistantMessageIndex}\u001f${assistantMessage.text}`;
    if (spokenAssistantMessageRef.current === messageKey) return undefined;
    spokenAssistantMessageRef.current = messageKey;

    speakVoicePrompt(assistantMessage.text, () => {
      if (!voiceConversationModeRef.current) return;
      if (assistantChatComplete) {
        speakVoicePrompt(
          "That’s everything I need. Whenever you’re ready, say something like “show me my recommendations” and I’ll bring up your looks.",
          scheduleVoiceChatListening,
        );
      } else {
        scheduleVoiceChatListening();
      }
    });
    return undefined;
  }, [
    voiceConversationMode,
    assistantChatBusy,
    assistantChatError,
    assistantChatMessages,
    assistantChatComplete,
  ]);

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
      profileDetails,
      wearHistory,
    });
  }, [wardrobe, plan, brief, options, selected, dayBrief, dayPlan, settings, profileDetails, wearHistory]);

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
    briefRef.current = brief;
  }, [brief]);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!authReady || !userId) {
      setNotificationJobs([]);
      setNotificationLoadStatus("idle");
      setNotificationError("");
      setPushStatus(cloudEnabled ? "signed-out" : "unavailable");
      return undefined;
    }

    let active = true;
    const refresh = async (showLoading = false) => {
      if (showLoading) setNotificationLoadStatus("loading");
      try {
        const [jobs, browserStatus] = await Promise.all([
          loadNotificationJobs(userId),
          getBrowserPushStatus(userId),
        ]);
        if (!active) return;
        setNotificationJobs(jobs);
        setNotificationLoadStatus("ready");
        setNotificationError("");
        setPushStatus(browserStatus);
      } catch (error) {
        console.error("Wearwell notification state could not be loaded", error);
        if (!active) return;
        setNotificationLoadStatus("error");
        setNotificationError(
          error instanceof Error ? error.message : "Notification setup is unavailable.",
        );
        setPushStatus("unavailable");
      }
    };

    void refresh(true);
    const timer = window.setInterval(() => void refresh(false), 60_000);
    const onServiceWorkerMessage = (event) => {
      if (event.data?.type === "wearwell-notification-received") void refresh(false);
    };
    navigator.serviceWorker?.addEventListener("message", onServiceWorkerMessage);

    return () => {
      active = false;
      window.clearInterval(timer);
      navigator.serviceWorker?.removeEventListener("message", onServiceWorkerMessage);
    };
  }, [authReady, session?.user?.id]);

  useEffect(() => () => {
    voiceConversationModeRef.current = false;
    window.clearTimeout(voiceListenTimerRef.current);
    speechTargetRef.current = "cancelled";
    speechTranscriptRef.current = "";
    assistantSpeechRequestRef.current += 1;
    recognitionRef.current?.abort();
    window.speechSynthesis?.cancel();
  }, []);

  useEffect(() => {
    if (!wardrobePhotoPreview) return undefined;
    return () => URL.revokeObjectURL(wardrobePhotoPreview);
  }, [wardrobePhotoPreview]);

  useEffect(() => {
    if (settings.voiceEnabled) return;
    cancelVoiceRecognition();
    stopVoiceConversation();
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

    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setProfileName(sessionDisplayName(nextSession));
      setAuthReady(true);
      if (event === "PASSWORD_RECOVERY") {
        setAuthMode("update_password");
        setAuthMessage("");
        setShowAuth(true);
      }
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const recoveryInUrl =
      new URLSearchParams(window.location.search).get("type") === "recovery" ||
      window.location.hash.includes("type=recovery");
    if (recoveryInUrl) {
      setAuthMode("update_password");
      setShowAuth(true);
    }
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
          if (cloudProfile.profile_details !== null && cloudProfile.profile_details !== undefined) {
            setProfileDetails(normalizeProfileDetails(cloudProfile.profile_details));
          }
          const savedLocation = cloudProfile.weather_location || null;
          const validSavedLocation =
            savedLocation && formatWeatherLocation(savedLocation) ? savedLocation : null;
          const savedPermission = cloudProfile.weather_permission || "not_asked";
          if (validSavedLocation) {
            setWeatherPermission(savedPermission);
            setWeatherLocation(validSavedLocation);
          } else if (savedPermission === "denied") {
            setWeatherPermission("denied");
            setWeatherLocation(null);
          } else if (weatherPermission !== "granted" || !weatherLocation) {
            setWeatherPermission(savedPermission);
            setWeatherLocation(null);
          }
        } else {
          await saveCloudProfile(session.user, options, profileName, {
            weatherPermission,
            weatherLocation,
          }, EMPTY_PROFILE_DETAILS);
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
          if (savedAppState.brief !== null) setBrief(savedAppState.brief);
          if (savedAppState.options) setOptions(savedAppState.options);
          const restoredDayPlan = normalizeDayPlan(savedAppState.dayPlan, {
            fallbackBrief: savedAppState.brief || brief,
            fallbackOccasion: savedAppState.plan || plan,
            legacySelected: savedAppState.selected,
          });
          const hydratedDayPlan = restoredDayPlan.events.length === 1 && savedAppState.dayBrief
            ? updateDayPlanEvent(restoredDayPlan, restoredDayPlan.activeEventId, (event) => ({
                ...event,
                dayBrief: { ...event.dayBrief, ...savedAppState.dayBrief },
              }))
            : restoredDayPlan;
          setDayPlan(hydratedDayPlan);
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
    if (!authReady) return undefined;
    if (weatherPermission !== "granted" || !weatherLocation) {
      setWeather(WEATHER_PERMISSION_REQUIRED);
      setWeatherStatus("permission");
      return undefined;
    }
    if (!cloudEnabled || !session?.user) {
      setWeather(FALLBACK_WEATHER);
      setWeatherStatus("fallback");
      return undefined;
    }

    let active = true;
    setWeatherStatus("loading");
    getWeatherContext(getDefaultWeatherQuery(weatherLocation, new Date(), dayBrief.timeWindow))
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
  }, [authReady, session?.user?.id, activeEventId, weatherPermission, weatherLocation?.city, weatherLocation?.latitude, weatherLocation?.longitude, dayBrief.timeWindow]);

  const recommendationSet = useMemo(
    () => scoreOutfitCandidates(wardrobe, {
      dayBrief,
      weather,
      wearHistory,
      regenerationReason,
      excludedItemSets,
    }),
    [wardrobe, dayBrief, weather, wearHistory, regenerationReason, excludedItemSets],
  );
  const swapRecommendationSet = useMemo(
    () => scoreOutfitCandidates(wardrobe, { dayBrief, weather, wearHistory }),
    [wardrobe, dayBrief, weather, wearHistory],
  );
  const visibleOutfits = useMemo(() => {
    const candidates = recommendationSet.candidates;
    if (candidates.length === 0) return [];
    const count = Math.min(options, candidates.length);
    const visibleCandidates = candidates.slice(0, count);
    if (selected && !visibleCandidates.some((candidate) => candidate.id === selected)) {
      const activeCandidate = swapRecommendationSet.candidates.find((candidate) => candidate.id === selected);
      if (activeCandidate) {
        visibleCandidates.splice(Math.max(0, visibleCandidates.length - 1), 1, activeCandidate);
      }
    }
    return visibleCandidates.map((candidate, index) => ({
      ...(activeSwapOverrides[candidate.id] || candidate),
      baseId: candidate.id,
      name: "Look " + String(index + 1).padStart(2, "0"),
    }));
  }, [recommendationSet, swapRecommendationSet, options, selected, activeSwapOverrides]);

  const wardrobeById = useMemo(() => Object.fromEntries(wardrobe.map((item) => [item.id, item])), [wardrobe]);
  const wardrobeGapPlan = useMemo(
    () => buildWardrobeGapPlan(wardrobe, dayBrief),
    [wardrobe, dayBrief],
  );
  const assistantCandidate =
    visibleOutfits.find((outfit) => outfit.id === selected) || visibleOutfits[0] || null;
  const assistantCandidateKey = assistantCandidate
    ? [
        assistantCandidate.id,
        ...assistantCandidate.itemIds,
        ...assistantCandidate.itemIds.map((itemId) => wardrobeById[itemId]?.name || ""),
        assistantCandidate.reason,
        assistantCandidate.weather,
        assistantCandidate.formality,
      ].join("\u001e")
    : "no-deterministic-look";

  useEffect(() => {
    if (assistantInputRevision === 0 || !settings.aiEnabled || !activeEventId) {
      assistantFollowUpRef.current = "";
      return undefined;
    }
    invalidateAssistant();
    const timer = window.setTimeout(
      () => {
        const followUpMessage = assistantFollowUpRef.current;
        assistantFollowUpRef.current = "";
        void requestAssistantHelp(followUpMessage);
      },
      weatherStatus === "loading" ? 1500 : 800,
    );
    return () => window.clearTimeout(timer);
  }, [
    assistantInputRevision,
    settings.aiEnabled,
    settings.voiceLanguage,
    activeEventId,
    activeEvent?.brief,
    dayBrief.occasion,
    dayBrief.timeWindow,
    session?.user?.id,
    weatherStatus,
    weather.tempC,
    weather.rainProbability,
    weather.windKph,
    weather.uvIndex,
    weather.conditionLabel,
    weather.source,
    weather.isFallback,
    assistantCandidateKey,
  ]);

  const accountName =
    profileName.trim() ||
    session?.user?.user_metadata?.display_name ||
    session?.user?.user_metadata?.full_name ||
    session?.user?.email?.split("@")[0] ||
    "your account";
  const accountInitial = accountName.charAt(0).toUpperCase();
  const hasProfileDetails = Object.values(profileDetails || {}).some(
    (value) => typeof value === "string" && value.trim().length > 0,
  );
  const showProfileReminder = !hasProfileDetails && !settings.profileReminderDismissed;
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
        ? "Weather location in Settings"
        : "Planning weather";
  const weatherCondition =
    weatherStatus === "loading"
      ? "checking forecast"
      : weatherStatus === "permission"
        ? "set in Settings"
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

  async function refreshNotificationJobs(userId = session?.user?.id, showLoading = false) {
    if (!userId) return [];
    if (showLoading) setNotificationLoadStatus("loading");
    try {
      const jobs = await loadNotificationJobs(userId);
      setNotificationJobs(jobs);
      setNotificationLoadStatus("ready");
      setNotificationError("");
      return jobs;
    } catch (error) {
      console.error("Wearwell notification list could not be refreshed", error);
      setNotificationLoadStatus("error");
      setNotificationError(
        error instanceof Error ? error.message : "Notification setup is unavailable.",
      );
      return [];
    }
  }

  function toggleNotificationPanel() {
    const opening = !notificationPanelOpen;
    setNotificationPanelOpen(opening);
    if (!opening || !session?.user?.id) return;

    const unreadIds = notificationJobs
      .filter((job) => job.status === "sent" && !job.read_at)
      .map((job) => job.id);
    if (unreadIds.length) {
      const readAt = new Date().toISOString();
      setNotificationJobs((current) =>
        current.map((job) => unreadIds.includes(job.id) ? { ...job, read_at: readAt } : job),
      );
      void markNotificationJobsRead(session.user.id, unreadIds).catch((error) => {
        console.error("Wearwell notification read state could not be saved", error);
      });
    }
    void refreshNotificationJobs(session.user.id);
  }

  async function enableBrowserNotifications() {
    if (!session?.user?.id) {
      setShowAuth(true);
      notify("Sign in before enabling background notifications.");
      return;
    }
    setPushBusy(true);
    try {
      await registerBrowserPushDevice(session.user.id);
      setPushStatus("subscribed");
      setNotificationError("");
      notify("Background notifications are enabled on this browser.");
      await refreshNotificationJobs(session.user.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Notifications could not be enabled.";
      setNotificationError(message);
      setPushStatus(
        typeof Notification !== "undefined" && Notification.permission === "denied"
          ? "denied"
          : "not-subscribed",
      );
      notify(message);
    } finally {
      setPushBusy(false);
    }
  }

  async function disableBrowserNotifications() {
    if (!session?.user?.id) return;
    setPushBusy(true);
    try {
      await removeBrowserPushDevice(session.user.id);
      setPushStatus("not-subscribed");
      notify("Background notifications are off on this browser.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Notifications could not be turned off.";
      setNotificationError(message);
      notify(message);
    } finally {
      setPushBusy(false);
    }
  }

  function openReminderDialog(entry) {
    if (!session?.user?.id) {
      setShowAuth(true);
      notify("Sign in to schedule a saved-look reminder.");
      return;
    }
    if (!settings.savedLookRemindersEnabled) {
      setActiveTab("settings");
      notify("Turn on saved-look reminders in Settings first.");
      return;
    }
    if (pushStatus !== "subscribed") {
      setActiveTab("settings");
      notify("Enable browser notifications before scheduling a reminder.");
      return;
    }
    setReminderEntry(entry);
    setReminderDateTime(defaultReminderDateTime());
  }

  async function submitReminder(event) {
    event.preventDefault();
    if (!reminderEntry || !session?.user?.id) return;
    const scheduledAt = new Date(reminderDateTime);
    if (!Number.isFinite(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now()) {
      notify("Choose a reminder time in the future.");
      return;
    }
    setReminderBusy(true);
    try {
      await createSavedLookReminder(
        session.user.id,
        reminderEntry,
        scheduledAt.toISOString(),
      );
      await refreshNotificationJobs(session.user.id);
      setReminderEntry(null);
      notify(`Reminder set for ${formatNotificationTime(scheduledAt.toISOString())}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "The reminder could not be saved.";
      setNotificationError(message);
      notify(message);
    } finally {
      setReminderBusy(false);
    }
  }

  async function scheduleWeatherWatch(entry, showUnavailableNotice = false) {
    if (!session?.user?.id || !settings.weatherAlertsEnabled) return false;
    if (pushStatus !== "subscribed") {
      if (showUnavailableNotice) notify("Enable browser notifications to receive weather alerts.");
      return false;
    }
    if (
      weatherStatus !== "live" ||
      weather.isFallback === true ||
      typeof weather.source !== "string" ||
      !weather.source.toLowerCase().includes("open-meteo")
    ) {
      if (showUnavailableNotice) {
        notify("Weather alerts need a live forecast for your chosen place.");
      }
      return false;
    }

    try {
      const query = getDefaultWeatherQuery(
        weatherLocation,
        new Date(),
        entry.dayBrief?.timeWindow || dayBrief.timeWindow,
      );
      const created = await createLiveWeatherWatch(session.user.id, entry, query, weather);
      if (created) {
        await refreshNotificationJobs(session.user.id);
        if (showUnavailableNotice) notify("Wearwell will check for a significant live weather change.");
      } else if (showUnavailableNotice) {
        notify("This event's forecast window is too close to start a weather watch.");
      }
      return created;
    } catch (error) {
      console.error("Wearwell weather alert could not be scheduled", error);
      if (showUnavailableNotice) {
        notify(error instanceof Error ? error.message : "The weather alert could not be saved.");
      }
      return false;
    }
  }

  function handleNotificationPreferenceChange(key, value) {
    if (!session?.user?.id) {
      setShowAuth(true);
      notify("Sign in to save notification preferences.");
      return;
    }
    updateSettings(key, value);

    if (!value) {
      const kind = key === "weatherAlertsEnabled" ? "weather_change" : "saved_look_reminder";
      void cancelNotificationJobsByKind(session.user.id, kind)
        .then(() => refreshNotificationJobs(session.user.id))
        .catch((error) => {
          console.error("Wearwell notification schedule could not be cancelled", error);
          notify("The preference changed, but pending alerts could not be cancelled.");
        });
      return;
    }

    if (key === "savedLookRemindersEnabled") {
      notify("Saved-look reminders are on. Set a date and time from Wear history.");
      return;
    }

    const currentSavedLook = [...wearHistory].reverse().find(
      (entry) => entry.eventId === activeEventId && entry.outfitId === selected,
    );
    if (currentSavedLook) {
      void scheduleWeatherWatch(currentSavedLook, true);
    } else {
      notify("Weather alerts will start with your next saved look and a live forecast.");
    }
  }

  async function cancelSavedLookReminder(job) {
    if (!session?.user?.id) return;
    try {
      await cancelNotificationJob(session.user.id, job.id);
      await refreshNotificationJobs(session.user.id);
      notify("Saved-look reminder cancelled.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "The reminder could not be cancelled.";
      setNotificationError(message);
      notify(message);
    }
  }

  function invalidateAssistant() {
    assistantRequestId.current += 1;
    setAssistantStatus("idle");
    setAssistantResult(null);
  }

  function markAssistantPlanningInputChanged(followUpMessage = "") {
    assistantFollowUpRef.current = followUpMessage;
    setAssistantLastQuestion(followUpMessage);
    setAssistantFollowUpDraft("");
    setAssistantInputRevision((revision) => revision + 1);
  }

  function showAssistantFallback(explanation) {
    setAssistantResult(parseAssistantResponse({ mode: "fallback", explanation }));
    setAssistantStatus("fallback");
  }

  function updateSettings(key, value) {
    setSettings((current) => key === "voiceLanguage"
      ? { ...current, voiceLanguage: value, speechVoiceId: "" }
      : { ...current, [key]: value });
    if (key === "voiceLanguage" || key === "speechVoiceId") {
      assistantSpeechRequestRef.current += 1;
      window.speechSynthesis?.cancel();
      if (voiceConversationModeRef.current) {
        stopVoiceConversation();
        notify("Voice settings changed. Start or resume voice chat to continue.");
      }
    }
    if ((key === "aiEnabled" && value === false) || key === "voiceLanguage") {
      invalidateAssistant();
    }
  }

  function cancelVoiceRecognition() {
    speechTargetRef.current = "cancelled";
    speechTranscriptRef.current = "";
    setSpeechPreview("");
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    recognition?.abort();
    setListening(false);
  }

  function stopVoiceConversation() {
    voiceConversationModeRef.current = false;
    setVoiceConversationMode(false);
    setVoiceConversationStatus("idle");
    window.clearTimeout(voiceListenTimerRef.current);
    voiceListenTimerRef.current = null;
    assistantSpeechRequestRef.current += 1;
    window.speechSynthesis?.cancel();
    if (speechTargetRef.current === "chat") cancelVoiceRecognition();
  }

  function startVoiceConversation() {
    if (!settings.voiceEnabled) {
      notify("Turn on speech in Settings before starting voice chat.");
      return;
    }
    if (!window.SpeechRecognition && !window.webkitSpeechRecognition) {
      notify("Speech recognition is not supported here. You can continue by typing.");
      return;
    }
    if (!window.speechSynthesis || typeof window.SpeechSynthesisUtterance !== "function") {
      notify("Spoken replies are not supported here. You can continue by typing.");
      return;
    }
    voiceConversationModeRef.current = true;
    setVoiceConversationMode(true);
    spokenAssistantMessageRef.current = "";
    spokenAssistantErrorRef.current = "";
    if (assistantChatBusy) {
      setVoiceConversationStatus("thinking");
      return;
    }
    if (assistantChatError) {
      setVoiceConversationStatus("thinking");
      return;
    }

    const latestAssistantMessage = [...assistantChatMessages]
      .reverse()
      .find((message) => message.role === "assistant");
    if (latestAssistantMessage) {
      setVoiceConversationStatus("speaking");
    } else if (assistantChatMessages.length === 0) {
      startAssistantInterview(briefRef.current.trim());
    } else {
      scheduleVoiceChatListening();
    }
  }

  function scheduleVoiceChatListening() {
    if (!voiceConversationModeRef.current) return;
    window.clearTimeout(voiceListenTimerRef.current);
    setVoiceConversationStatus("listening");
    voiceListenTimerRef.current = window.setTimeout(() => {
      voiceListenTimerRef.current = null;
      if (voiceConversationModeRef.current) startVoiceRecognition("chat");
    }, 350);
  }

  function addVoiceDetailToBrief(transcript) {
    const previous = briefRef.current.trim();
    const detail = transcript.trim();
    const availableLength = Math.max(0, 1500 - previous.length - (previous ? 1 : 0));
    if (availableLength === 0) {
      speakVoicePrompt(
        "Your brief is full. You can shorten it before adding more, or say “show me my recommendations” to continue.",
        scheduleVoiceChatListening,
      );
      return;
    }

    const nextDetail = detail.slice(0, availableLength);
    if (nextDetail.length < detail.length) {
      notify(`I added the first ${availableLength} characters of that spoken detail to your brief.`);
    }
    const updatedBrief = [previous, nextDetail].filter(Boolean).join(" ");
    handleBriefChange(updatedBrief);
    startAssistantInterview(updatedBrief);
  }

  function sendRecognizedAssistantAnswer(transcript) {
    const answer = transcript.trim().slice(0, 500);
    if (!answer) return;
    if (transcript.trim().length > 500) {
      notify("I sent the first 500 characters of that spoken reply.");
    }
    pendingVoiceReplyRef.current = answer;
    submitAssistantChatReply(answer);
  }

  function handleAssistantVoiceReply(transcript) {
    if (!voiceConversationModeRef.current) return;

    const voiceCommand = transcript
      .trim()
      .replace(/[.!?,;:]+$/g, "")
      .replace(/\s+/g, " ")
      .toLowerCase();
    if ([
      "stop",
      "stop voice",
      "stop voice chat",
      "stop listening",
      "pause voice",
      "pause voice chat",
      "pause listening",
      "end voice chat",
      "end voice conversation",
      "cancel voice chat",
      "turn off voice chat",
    ].includes(voiceCommand)) {
      stopVoiceConversation();
      notify("Voice chat stopped. You can continue by typing or resume voice chat.");
      return;
    }

    if (assistantChatError) {
      if (/\b(?:retry|try again)\b/i.test(transcript)) {
        if (assistantChatCurrentField && pendingVoiceReplyRef.current) {
          submitAssistantChatReply(pendingVoiceReplyRef.current);
        } else {
          startAssistantInterview(briefRef.current.trim());
        }
        return;
      }
      if (assistantChatCurrentField) sendRecognizedAssistantAnswer(transcript);
      else addVoiceDetailToBrief(transcript);
      return;
    }

    if (assistantChatComplete) {
      const intent = classifyRecommendationIntent(transcript);
      if (intent === "approve") {
        stopVoiceConversation();
        setAssistantChatOpen(false);
        handleReviewRecommendations();
        return;
      }
      if (intent === "wait") {
        setAssistantChatMessages((current) => [
          ...current,
          { role: "user", text: transcript },
        ]);
        speakVoicePrompt(
          "No rush. Add another detail if you need to, or say something like “show me my recommendations” when you’re ready.",
          scheduleVoiceChatListening,
        );
        return;
      }

      addVoiceDetailToBrief(transcript);
      return;
    }

    if (assistantChatCurrentField) sendRecognizedAssistantAnswer(transcript);
    else addVoiceDetailToBrief(transcript);
  }

  function startVoiceRecognition(target) {
    if (!settings.voiceEnabled) {
      notify("Turn on optional browser speech in Settings before using the microphone.");
      if (target === "chat") stopVoiceConversation();
      return false;
    }

    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      if (target === "chat") stopVoiceConversation();
      notify("Speech recognition is not supported here. You can continue by typing.");
      return false;
    }

    window.clearTimeout(voiceListenTimerRef.current);
    voiceListenTimerRef.current = null;
    const recognition = new Recognition();
    recognition.lang = settings.voiceLanguage;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    speechTargetRef.current = target;
    speechTranscriptRef.current = "";
    setSpeechPreview("");
    recognition.onresult = (event) => {
      const transcript = transcriptFromRecognitionResults(event.results);
      speechTranscriptRef.current = transcript;
      setSpeechPreview(transcript);
    };
    recognition.onerror = (event) => {
      const failedTarget = speechTargetRef.current;
      setListening(false);
      if (recognitionRef.current === recognition) recognitionRef.current = null;
      if (event.error === "aborted" || event.error === "no-speech") return;

      if (failedTarget === "chat") stopVoiceConversation();
      else cancelVoiceRecognition();
      notify(event.error === "not-allowed"
        ? "Microphone access was declined. You can continue by typing."
        : "Speech capture stopped. You can continue by typing.");
    };
    recognition.onend = () => {
      const endedTarget = speechTargetRef.current;
      const transcript = speechTranscriptRef.current.trim();
      speechTargetRef.current = "idle";
      speechTranscriptRef.current = "";
      setSpeechPreview("");
      setListening(false);
      if (recognitionRef.current === recognition) recognitionRef.current = null;
      if (endedTarget === "cancelled") return;

      if (!transcript) {
        if (endedTarget === "chat" && voiceConversationModeRef.current) {
          scheduleVoiceChatListening();
        } else if (endedTarget === "brief") {
          notify("I didn’t catch that. Try speaking again or type your brief.");
        }
        return;
      }

      if (endedTarget === "chat") {
        handleAssistantVoiceReply(transcript);
        return;
      }

      if (endedTarget === "brief") {
        const previous = briefRef.current === defaultState.brief ? "" : briefRef.current.trim();
        const nextBrief = [previous, transcript].filter(Boolean).join(" ");
        briefRef.current = nextBrief;
        handleBriefChange(nextBrief);
        processBrief(nextBrief, { voiceMode: true });
      }
    };
    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
      if (target === "chat") setVoiceConversationStatus("listening");
      return true;
    } catch {
      if (recognitionRef.current === recognition) recognitionRef.current = null;
      speechTargetRef.current = "idle";
      speechTranscriptRef.current = "";
      setSpeechPreview("");
      setListening(false);
      if (target === "chat") stopVoiceConversation();
      notify("Speech capture could not start. You can continue by typing.");
      return false;
    }
  }

  function handleListen() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    if (voiceConversationModeRef.current) {
      if (voiceConversationStatus === "thinking") return;
      if (voiceConversationStatus === "speaking") {
        assistantSpeechRequestRef.current += 1;
        window.speechSynthesis?.cancel();
      }
      startVoiceRecognition("chat");
      return;
    }
    startVoiceRecognition("brief");
  }

  function speakVoicePrompt(text, onEnd) {
    if (!voiceConversationModeRef.current) return false;
    const requestId = ++assistantSpeechRequestRef.current;
    setVoiceConversationStatus("speaking");
    const finish = () => {
      if (
        requestId === assistantSpeechRequestRef.current &&
        voiceConversationModeRef.current
      ) onEnd?.();
    };
    const fail = () => {
      if (
        requestId !== assistantSpeechRequestRef.current ||
        !voiceConversationModeRef.current
      ) return;
      stopVoiceConversation();
      notify("I couldn’t read the reply aloud. You can continue by typing.");
    };
    const started = handleSpeakText(text, {
      onEnd: finish,
      onError: fail,
      silent: true,
    });
    if (!started) {
      stopVoiceConversation();
      notify("Read-aloud isn’t available here. You can continue by typing.");
    }
    return started;
  }

  function handleSpeakText(text, options = {}) {
    if (!settings.voiceEnabled) {
      if (!options.silent) notify("Turn on optional browser speech in Settings before using read-aloud.");
      return false;
    }
    if (!window.speechSynthesis || typeof window.SpeechSynthesisUtterance !== "function") {
      if (!options.silent) notify("Read-aloud is not supported here. The text remains available on screen.");
      return false;
    }
    window.speechSynthesis.cancel();
    const utterance = new window.SpeechSynthesisUtterance(text);
    utterance.lang = settings.voiceLanguage;
    const selectedVoice = speechVoiceOptions.find(
      (voice) => speechVoiceId(voice) === settings.speechVoiceId,
    );
    if (selectedVoice) utterance.voice = selectedVoice;
    if (typeof options.onEnd === "function") utterance.onend = options.onEnd;
    if (typeof options.onError === "function") utterance.onerror = options.onError;
    try {
      window.speechSynthesis.speak(utterance);
      return true;
    } catch {
      if (!options.silent) notify("Read-aloud is not supported here. The text remains available on screen.");
      return false;
    }
  }

  function handleTestSpeechVoice() {
    const samples = {
      "en-GB": "Hello, I’m Wearwell. This is a sample of the selected voice.",
      "en-US": "Hi, I’m Wearwell. This is a sample of your selected voice.",
      "fr-FR": "Bonjour, je suis Wearwell. Voici un exemple de la voix sélectionnée.",
      "pt-PT": "Olá, sou a Wearwell. Este é um exemplo da voz selecionada.",
      "es-ES": "Hola, soy Wearwell. Esta es una muestra de la voz seleccionada.",
    };
    handleSpeakText(samples[settings.voiceLanguage] || samples["en-GB"]);
  }

  async function requestAssistantHelp(followUpMessage = "") {
    if (!settings.aiEnabled) return;
    const requestId = ++assistantRequestId.current;
    const eventBrief = activeEvent?.brief || brief;
    if (eventBrief.length > 1500) {
      showAssistantFallback("Shorten this event brief to 1,500 characters or fewer for AI help.");
      return;
    }
    if (!assistantCandidate) {
      showAssistantFallback("Add your own wardrobe pieces before AI can explain a complete outfit. Wearwell will not invent clothing.");
      return;
    }
    if (!supabase) {
      showAssistantFallback("AI planning is not configured in this environment. Your local brief and real-wardrobe recommendations remain available.");
      return;
    }
    if (!session?.user) {
      showAssistantFallback("Sign in to use AI planning. Your brief and deterministic wardrobe recommendations remain available locally.");
      return;
    }
    setAssistantResult(null);
    setAssistantStatus("loading");
    try {
      const { data: payload, error } = await supabase.functions.invoke("interpret-assistant", {
        body: buildAssistantRequestPayload({
          brief: eventBrief,
          occasion: dayBrief.occasion || plan,
          voiceLanguage: settings.voiceLanguage,
          weather,
          weatherStatus,
          candidate: assistantCandidate,
          wardrobeById,
          activeEvent,
          dayContext: dayPlan.events,
          followUpMessage,
          profileDetails,
          shareProfileWithAi: settings.shareProfileWithAi,
        }),
        signal: typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
          ? AbortSignal.timeout(15000)
          : undefined,
      });
      if (error) throw error;
      if (requestId !== assistantRequestId.current) return;
      const parsed = parseAssistantResponse(payload);
      setAssistantResult(parsed);
      setAssistantStatus(parsed.mode === "ai" ? "ready" : "fallback");
    } catch {
      if (requestId !== assistantRequestId.current) return;
      showAssistantFallback("The AI service did not respond. Your deterministic wardrobe recommendations remain available.");
    }
  }

  function applyAssistantChatAnswers(nextAnswers) {
    const changes = Object.fromEntries(
      assistantChatFieldKeys
        .filter((key) => {
          const answer = typeof nextAnswers[key] === "string" ? nextAnswers[key].trim() : "";
          return answer && answer !== (dayBrief?.[key] || "");
        })
        .map((key) => [key, nextAnswers[key].trim().slice(0, assistantChatFieldLimits[key])]),
    );
    if (Object.keys(changes).length === 0) return;

    updateActiveDayPlan((event) => ({
      ...event,
      dayBrief: { ...(event.dayBrief || {}), ...changes },
      excludedItemSets: [],
      regenerationReason: "",
    }));
    setSwapOverrides((current) => {
      const next = { ...current };
      delete next[activeEventId];
      return next;
    });
    setSwapOutfitId(null);
    invalidateAssistant();
  }

  async function requestAssistantChat(payload, userMessage = "") {
    if (!supabase) return;
    const requestId = ++assistantChatRequestId.current;
    if (voiceConversationModeRef.current) setVoiceConversationStatus("thinking");
    setAssistantChatBusy(true);
    setAssistantChatError("");
    try {
      const { data, error } = await supabase.functions.invoke("brief-interview", {
        body: {
          ...payload,
          conversation: payload.action === "reply"
            ? buildAssistantConversationFromMessages(assistantChatMessages)
            : Array.isArray(payload.conversation) ? payload.conversation : [],
        },
        signal: typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
          ? AbortSignal.timeout(15000)
          : undefined,
      });
      if (error) throw error;
      if (requestId !== assistantChatRequestId.current) return;
      if (
        !data ||
        typeof data.assistantMessage !== "string" ||
        typeof data.answers !== "object" ||
        !Array.isArray(data.resolvedFields)
      ) {
        throw new Error("The assistant returned an invalid response.");
      }

      const nextAnswers = assistantChatValues(data.answers);
      const nextResolvedFields = data.resolvedFields.filter((key) =>
        assistantChatFieldKeys.includes(key),
      );
      applyAssistantChatAnswers(nextAnswers);
      setAssistantChatAnswers(nextAnswers);
      setAssistantChatResolvedFields(nextResolvedFields);
      setAssistantChatCurrentField(
        assistantChatFieldKeys.includes(data.currentField) ? data.currentField : null,
      );
      setAssistantChatComplete(data.isComplete === true);
      setAssistantChatFallback(data.mode !== "ai");
      setAssistantChatMessages((current) => [
        ...current,
        ...(userMessage ? [{ role: "user", text: userMessage }] : []),
        { role: "assistant", text: data.assistantMessage.slice(0, 360) },
      ]);
      if (userMessage) {
        setAssistantChatDraft("");
        pendingVoiceReplyRef.current = "";
      }
    } catch {
      if (requestId !== assistantChatRequestId.current) return;
      setAssistantChatError("I couldn’t reach the assistant just now. Your saved brief is unchanged; please try again.");
    } finally {
      if (requestId === assistantChatRequestId.current) setAssistantChatBusy(false);
    }
  }

  function startAssistantInterview(initialBrief = "") {
    if (!supabase) return;
    spokenAssistantMessageRef.current = "";
    spokenAssistantErrorRef.current = "";
    pendingVoiceReplyRef.current = "";
    if (voiceConversationModeRef.current) setVoiceConversationStatus("thinking");
    const answers = assistantChatValues(dayBrief);
    // The day view defaults to Work; do not treat that default as the user's intent.
    answers.occasion = "";
    const resolvedFields = assistantChatFieldKeys.filter(
      (key) => key !== "occasion" && answers[key],
    );
    setAssistantChatAnswers(answers);
    setAssistantChatResolvedFields(resolvedFields);
    setAssistantChatCurrentField(null);
    setAssistantChatComplete(false);
    setAssistantChatFallback(false);
    setAssistantChatError("");
    setAssistantChatDraft("");
    setAssistantChatMessages([]);
    const conversation = buildAssistantConversationFromBrief(initialBrief);
    void requestAssistantChat({
      action: "start",
      answers,
      resolvedFields,
      currentField: null,
      latestAnswer: "",
      conversation,
    }, initialBrief.trim());
  }

  function toggleAssistantChat() {
    if (assistantChatOpen) {
      stopVoiceConversation();
      assistantChatRequestId.current += 1;
      setAssistantChatBusy(false);
      setAssistantChatOpen(false);
      return;
    }
    setAssistantChatOpen(true);
    setAssistantChatMessages([]);
    setAssistantChatDraft("");
    setAssistantChatError("");
    setAssistantChatFallback(false);
    if (supabase) {
      startAssistantInterview();
    }
  }

  function processBrief(briefOverride, { voiceMode = false } = {}) {
    const initialBrief = typeof briefOverride === "string"
      ? briefOverride.trim()
      : briefRef.current.trim();
    if (!initialBrief) {
      notify("Write or say a little about your day before processing your brief.");
      return;
    }
    if (initialBrief.length > 1500) {
      notify("Keep your brief to 1,500 characters or fewer so the assistant can process it.");
      return;
    }
    if (listening && !voiceMode) {
      recognitionRef.current?.stop();
      notify("Voice capture stopped. Press Process my brief again to continue.");
      return;
    }

    if (voiceMode && supabase) {
      voiceConversationModeRef.current = true;
      setVoiceConversationMode(true);
      setVoiceConversationStatus("thinking");
      spokenAssistantMessageRef.current = "";
      spokenAssistantErrorRef.current = "";
    } else if (voiceMode) {
      notify("The assistant chat isn’t available right now. Your spoken brief is saved; you can review recommendations below.");
    }
    setAssistantChatOpen(true);
    setAssistantChatMessages([]);
    setAssistantChatError("");
    setAssistantChatFallback(false);
    startAssistantInterview(initialBrief);
    window.requestAnimationFrame(() => {
      document.getElementById("assistant-chat-panel")?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    });
  }

  function submitAssistantChatReply(reply) {
    const answer = reply.trim();
    if (
      !answer ||
      assistantChatBusy ||
      assistantChatComplete ||
      !assistantChatCurrentField
    ) return;
    void requestAssistantChat({
      action: "reply",
      answers: assistantChatAnswers,
      resolvedFields: assistantChatResolvedFields,
      currentField: assistantChatCurrentField,
      latestAnswer: answer,
    }, answer === "skip this question" ? "Skip" : answer);
  }

  function handleAssistantChatSubmit(event) {
    event.preventDefault();
    submitAssistantChatReply(assistantChatDraft);
  }

  function handleReviewRecommendations() {
    if (voiceConversationModeRef.current) stopVoiceConversation();
    window.requestAnimationFrame(() => {
      document.getElementById("next-wear-plan")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
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

  function clearAllEventRecommendationState() {
    setDayPlan((current) => ({
      ...current,
      events: current.events.map((event) => ({
        ...event,
        excludedItemSets: [],
        regenerationReason: "",
      })),
    }));
    setSwapOverrides({});
    setSwapOutfitId(null);
  }

  function handleRegenerate(reason = regenerationReason || "different_items", followUpMessage = "") {
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
      return false;
    }
    updateActiveDayPlan((event) => ({
      ...event,
      excludedItemSets: [...new Set([...(event.excludedItemSets || []), ...signaturesToExclude])],
      regenerationReason: reason,
    }));
    setShowRegenerateOptions(false);
    setSwapOutfitId(null);
    invalidateAssistant();
    markAssistantPlanningInputChanged(followUpMessage);
    notify("Showing another valid combination from your wardrobe.");
    return true;
  }

  function handleAssistantFollowUpSubmit(event) {
    event.preventDefault();
    const message = assistantFollowUpDraft.trim();
    if (!message || assistantStatus === "loading") return;

    setAssistantFollowUpDraft("");
    setAssistantLastQuestion(message);
    const intent = classifyAssistantFollowUp(message);
    if (intent.kind === "regenerate" && handleRegenerate(intent.reason, message)) return;
    void requestAssistantHelp(message);
  }

  function handleBriefChange(nextBrief, nextPlan = plan) {
    const nextDayPlan = parseDayPlan(nextBrief, nextPlan, dayPlan);
    const nextEventId = nextDayPlan.events.some((event) => event.id === activeEventId)
      ? activeEventId
      : nextDayPlan.events[0]?.id || "event-1";
    briefRef.current = nextBrief;
    setBrief(nextBrief);
    setDayPlan({ ...nextDayPlan, activeEventId: nextEventId });
    setSwapOverrides({});
    setSwapOutfitId(null);
    invalidateAssistant();
    markAssistantPlanningInputChanged();
  }

  function handleEventBriefChange(nextBrief) {
    const occasion = activeEvent?.dayBrief?.occasion || activeEvent?.label || plan;
    const nextDayBrief = extractDayBrief(nextBrief, occasion);
    updateActiveDayPlan((event) => ({
      ...event,
      brief: nextBrief,
      dayBrief: nextDayBrief,
      excludedItemSets: [],
      regenerationReason: "",
    }));
    setSwapOverrides((current) => {
      const next = { ...current };
      delete next[activeEventId];
      return next;
    });
    setSwapOutfitId(null);
    invalidateAssistant();
    markAssistantPlanningInputChanged();
  }

  function handleEventChange(eventId) {
    const nextEvent = eventStateFor(dayPlan, eventId);
    if (!nextEvent || nextEvent.id === activeEventId) return;
    assistantChatRequestId.current += 1;
    setAssistantChatOpen(false);
    setAssistantChatBusy(false);
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    setListening(false);
    window.speechSynthesis?.cancel();
    setDayPlan((current) => ({ ...current, activeEventId: nextEvent.id }));
    setShowRegenerateOptions(false);
    setSwapOutfitId(null);
    invalidateAssistant();
    markAssistantPlanningInputChanged();
  }

  function handleDayBriefFieldChange(key, value) {
    updateActiveDayPlan((event) => ({
      ...event,
      dayBrief: { ...event.dayBrief, [key]: value },
      excludedItemSets: [],
      regenerationReason: "",
    }));
    setSwapOverrides((current) => {
      const next = { ...current };
      delete next[activeEventId];
      return next;
    });
    setSwapOutfitId(null);
    invalidateAssistant();
    markAssistantPlanningInputChanged();
  }

  function handlePlanChange(nextPlan) {
    if (nextPlan === plan) return;
    updateActiveDayPlan((event) => ({
      ...event,
      dayBrief: extractDayBrief(event.brief || "", nextPlan),
      excludedItemSets: [],
      regenerationReason: "",
    }));
    setSwapOverrides((current) => {
      const next = { ...current };
      delete next[activeEventId];
      return next;
    });
    setSwapOutfitId(null);
    invalidateAssistant();
    markAssistantPlanningInputChanged();
  }

  function handleReviewBrief() {
    document.getElementById("day-brief")?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.requestAnimationFrame(() => {
      document.querySelector('[aria-label="Describe what your next wear needs"]')?.focus();
    });
  }

  function handleChooseLook(outfit) {
    const nextState = selectRecommendation(
      { selected, wearHistory },
      outfit,
      {
        dayBrief,
        wardrobeById,
        eventId: activeEventId,
        eventLabel: activeEvent?.label || dayBrief.occasion,
      },
    );
    if (nextState.selected === selected && nextState.wearHistory === wearHistory) {
      notify("This look is already saved for today.");
      return;
    }
    setWearHistory(nextState.wearHistory);
    updateActiveDayPlan((event) => ({
      ...event,
      selectedRecommendation: nextState.selected,
    }));
    invalidateAssistant();
    markAssistantPlanningInputChanged();
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
      { selected, wearHistory },
      outfit,
      alternative,
      {
        dayBrief,
        wardrobeById,
        eventId: activeEventId,
        eventLabel: activeEvent?.label || dayBrief.occasion,
      },
    );
    if (nextState !== null && nextState !== undefined) {
      setWearHistory(nextState.wearHistory);
      if (nextState.selected !== selected) {
        updateActiveDayPlan((event) => ({
          ...event,
          selectedRecommendation: nextState.selected,
        }));
      }
    }
    invalidateAssistant();
    markAssistantPlanningInputChanged();
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
    setDayPlan((current) => ({
      ...current,
      events: current.events.map((event) => ({ ...event, selectedRecommendation: null })),
    }));
    setSwapOverrides({});
    notify("Wear history was cleared from this device.");
  }

  function applyAssistantSuggestion(key, value) {
    if (!Object.hasOwn(ASSISTANT_FIELD_LIMITS, key) || !value || dayBrief[key]?.trim()) return;
    handleDayBriefFieldChange(key, value);
  }

  async function handleOptionCountChange(count) {
    setOptions(count);
    if (!session?.user) return;

    try {
      await saveCloudProfile(
        session.user,
        count,
        profileName,
        { weatherPermission, weatherLocation },
        profileDetails,
      );
      setCloudStatus("synced");
    } catch (error) {
      console.error("Wearwell option preference save failed", error);
      notify("Saved on this device, but your option preference needs another try.");
    }
  }

  function updateWardrobeDraftField(field, value) {
    if (field.startsWith("visualAttributes.")) {
      const attribute = field.slice("visualAttributes.".length);
      setNewItem((current) => ({
        ...current,
        visualAttributes: { ...current.visualAttributes, [attribute]: value },
      }));
    } else {
      setNewItem((current) => ({
        ...current,
        [field]: value,
        ...(field === "formality" ? { formalityExplicit: value !== null } : {}),
      }));
    }
    setDraftTouchedFields((current) => new Set([...current, field]));
  }

  function clearWardrobePhoto() {
    wardrobePhotoAbortRef.current?.abort();
    wardrobePhotoAbortRef.current = null;
    setWardrobePhotoFile(null);
    setWardrobePhotoPreview("");
    setWardrobePhotoBusy(false);
    setWardrobePhotoError("");
    setWardrobePhotoSuggestion(null);
    setWardrobePhotoSuggestionsApplied(false);
    setWardrobePhotoOpen(false);
    if (wardrobeCameraInputRef.current) wardrobeCameraInputRef.current.value = "";
    if (wardrobeUploadInputRef.current) wardrobeUploadInputRef.current.value = "";
  }

  function closeWardrobeEditor() {
    setShowAddItem(false);
    clearWardrobePhoto();
  }

  function selectWardrobePhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    clearWardrobePhoto();
    const validationError = validateWardrobePhotoFile(file);
    if (validationError) {
      setWardrobePhotoOpen(true);
      setWardrobePhotoError(validationError);
      return;
    }
    setWardrobePhotoFile(file);
    setWardrobePhotoPreview(URL.createObjectURL(file));
    setWardrobePhotoOpen(true);
  }

  async function analyzeWardrobePhoto() {
    if (!wardrobePhotoFile || wardrobePhotoBusy) return;
    if (!session?.user) {
      setWardrobePhotoError("Sign in to analyze a photo. You can still enter every detail manually.");
      return;
    }
    if (!supabase || !settings.aiEnabled) {
      setWardrobePhotoError("Photo analysis is unavailable or turned off. You can still enter every detail manually.");
      return;
    }

    const controller = new AbortController();
    wardrobePhotoAbortRef.current?.abort();
    wardrobePhotoAbortRef.current = controller;
    const timeoutId = window.setTimeout(() => controller.abort(), 20_000);
    setWardrobePhotoBusy(true);
    setWardrobePhotoError("");
    setWardrobePhotoSuggestion(null);
    setWardrobePhotoSuggestionsApplied(false);
    try {
      const preparedImage = await prepareWardrobePhoto(wardrobePhotoFile);
      const imageBase64 = await imageBlobToBase64(preparedImage);
      if (controller.signal.aborted) return;
      const { data, error } = await supabase.functions.invoke("analyze-wardrobe-photo", {
        body: { mimeType: preparedImage.type, imageBase64 },
        signal: controller.signal,
      });
      if (error) throw error;
      const suggestion = normalizeWardrobeVisionResult(data?.result);
      if (!suggestion) throw new Error("Invalid analysis response.");
      if (!controller.signal.aborted) setWardrobePhotoSuggestion(suggestion);
    } catch {
      if (!controller.signal.aborted) {
        setWardrobePhotoError("Photo analysis could not finish. Try another photo or enter the details manually.");
      }
    } finally {
      window.clearTimeout(timeoutId);
      if (wardrobePhotoAbortRef.current === controller) {
        wardrobePhotoAbortRef.current = null;
        setWardrobePhotoBusy(false);
      }
    }
  }

  function applyReviewedWardrobeSuggestions() {
    if (!wardrobePhotoSuggestion || wardrobePhotoSuggestionsApplied) return;
    setNewItem((current) =>
      applyWardrobeVisionSuggestion(current, wardrobePhotoSuggestion, draftTouchedFields),
    );
    setWardrobePhotoSuggestionsApplied(true);
  }

  function openAddItem() {
    clearWardrobePhoto();
    setEditingItemId(null);
    setNewItem(emptyWardrobeDraft());
    setDraftTouchedFields(new Set());
    setShowAddItem(true);
  }

  function openItemEditor(item) {
    clearWardrobePhoto();
    setEditingItemId(item.id);
    const visualAttributes = normalizeWardrobeVisualAttributes(item.visualAttributes);
    setNewItem({
      name: item.name,
      type: item.type,
      tone: item.tone || "",
      color: item.color || "#d4c4e8",
      note: item.note || "",
      formality: Number.isInteger(item.formality) ? item.formality : null,
      formalityExplicit: item.formalityExplicit === true || visualAttributes.formalityConfirmed,
      weather: item.weather || "all",
      visualAttributes,
    });
    const touched = new Set(["name", "type", "tone", "color", "note"]);
    if (Number.isInteger(item.formality)) touched.add("formality");
    if (item.weather && item.weather !== "all") touched.add("weather");
    if (visualAttributes.pattern !== "uncertain") touched.add("visualAttributes.pattern");
    if (visualAttributes.visibleDetails) touched.add("visualAttributes.visibleDetails");
    setDraftTouchedFields(touched);
    setShowAddItem(true);
  }

  async function saveItem(event) {
    event.preventDefault();
    if (!newItem.name.trim()) return;

    const existingItem = wardrobe.find((item) => item.id === editingItemId);
    const localItem = buildWardrobeItemRecord(newItem, existingItem);

    setWardrobe((items) =>
      existingItem
        ? items.map((item) => (item.id === existingItem.id ? localItem : item))
        : [...items, localItem],
    );
    clearAllEventRecommendationState();

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

    setNewItem(emptyWardrobeDraft());
    setEditingItemId(null);
    setDraftTouchedFields(new Set());
    closeWardrobeEditor();
    notify(existingItem ? "Your wardrobe piece was updated." : "Added to your wardrobe.");
  }

  async function removeItem() {
    const item = wardrobe.find((candidate) => candidate.id === editingItemId);
    if (!item) return;

    setWardrobe((items) => items.filter((candidate) => candidate.id !== item.id));
    clearAllEventRecommendationState();
    setEditingItemId(null);
    closeWardrobeEditor();

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

  function changeAuthMode(nextMode) {
    setAuthMode(nextMode);
    setAuthMessage("");
    setAuthPassword("");
    setAuthPasswordConfirmation("");
  }

  async function handlePasswordAuth(event) {
    event.preventDefault();
    if (!supabase) {
      setAuthMessage("Account sign-in is not available in this preview.");
      return;
    }
    if (authMode === "sign_up" && authPassword !== authPasswordConfirmation) {
      setAuthMessage("Those passwords do not match.");
      return;
    }

    setAuthBusy(true);
    setAuthMessage("");
    try {
      if (authMode === "sign_up") {
        const { data, error } = await supabase.auth.signUp({
          email: authEmail.trim(),
          password: authPassword,
          options: { emailRedirectTo: getAuthRedirectUrl() },
        });
        if (error) throw error;
        setAuthPassword("");
        setAuthPasswordConfirmation("");
        setAuthMessage(data.session
          ? "Your account is ready."
          : "Check your inbox to confirm your email, then sign in.");
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: authEmail.trim(),
        password: authPassword,
      });
      if (error) throw error;
      setAuthPassword("");
      setAuthMessage("");
    } catch {
      setAuthMessage(authMode === "sign_up"
        ? "We couldn't create that account. Check your details or try signing in."
        : "We couldn't sign you in. Check your email and password.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function sendPasswordRecovery(event) {
    event.preventDefault();
    if (!supabase || !authEmail.trim()) return;

    setAuthBusy(true);
    setAuthMessage("");
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(authEmail.trim(), {
        redirectTo: getAuthRedirectUrl(),
      });
      if (error) throw error;
      setAuthMessage("If an account matches that email, a recovery link has been sent.");
    } catch {
      setAuthMessage("We couldn't send a recovery email. Check the address and try again.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function updateRecoveredPassword(event) {
    event.preventDefault();
    if (!supabase) return;
    if (authPassword !== authPasswordConfirmation) {
      setAuthMessage("Those passwords do not match.");
      return;
    }

    setAuthBusy(true);
    setAuthMessage("");
    try {
      const { error } = await supabase.auth.updateUser({ password: authPassword });
      if (error) throw error;
      setAuthPassword("");
      setAuthPasswordConfirmation("");
      setAuthMode("sign_in");
      setShowAuth(false);
      notify("Your password was updated.");
    } catch {
      setAuthMessage("We couldn't update the password. Request a new recovery link and try again.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function persistWeatherPreferences(permission, location) {
    if (!session?.user) return true;

    const hasProfileDetailsToSave = Object.values(normalizeProfileDetails(profileDetails))
      .some((value) => typeof value === "string" && value.length > 0);
    setCloudStatus("syncing");
    try {
      const profileSaved = await saveCloudProfile(
        session.user,
        options,
        profileName,
        { weatherPermission: permission, weatherLocation: location },
        profileDetails,
      );
      const profileSyncComplete = profileSaved || !hasProfileDetailsToSave;
      setCloudStatus(profileSyncComplete ? "synced" : "error");
      return profileSyncComplete;
    } catch (error) {
      console.error("Wearwell weather preference save failed", error);
      setCloudStatus("error");
      return false;
    }
  }

  async function requestWeatherLocation() {
    if (!cloudEnabled) {
      setLocationMessage("Live weather is not configured in this app.");
      return;
    }
    if (locationRequestInFlightRef.current) return;
    locationRequestInFlightRef.current = true;
    setLocationBusy(true);
    setLocationMessage("");

    try {
      const location = await getBrowserLocation();
      setWeatherPermission("granted");
      setWeatherLocation(location);
      const saved = await persistWeatherPreferences("granted", location);
      setLocationMessage(saved
        ? "Approximate location is ready for the forecast."
        : "Location works on this device, but account sync needs another try.");
    } catch (error) {
      if (error?.code === 1) {
        setWeatherPermission("denied");
        setWeatherLocation(null);
        const saved = await persistWeatherPreferences("denied", null);
        setLocationMessage(saved
          ? "Location access was blocked. Allow it in your browser settings to use weather."
          : "Location access was blocked. Allow it in your browser settings to use weather; account sync also needs another try.");
      } else if (error?.code === "UNSUPPORTED") {
        setLocationMessage("This browser does not support location access.");
      } else if (error?.code === 3) {
        setLocationMessage("Location took too long to load. Try again.");
      } else {
        setLocationMessage("We couldn't get your location. Try again.");
      }
    } finally {
      locationRequestInFlightRef.current = false;
      setLocationBusy(false);
    }
  }

  async function disableWeatherLocation() {
    setLocationBusy(true);
    setWeatherPermission("denied");
    setWeatherLocation(null);
    setLocationMessage("Weather location has been turned off.");
    try {
      const saved = await persistWeatherPreferences("denied", null);
      if (!saved) {
        setLocationMessage("Weather is off on this device, but account sync needs another try.");
      }
    } finally {
      setLocationBusy(false);
    }
  }

  async function saveProfile(event) {
    event.preventDefault();
    if (!session?.user) return;

    setAuthBusy(true);
    setAuthMessage("");
    try {
      const hasProfileDetailsToSave = Object.values(normalizeProfileDetails(profileDetails))
        .some((value) => typeof value === "string" && value.length > 0);
      const profileSaved = await saveCloudProfile(session.user, options, profileName, {
        weatherPermission,
        weatherLocation,
      }, profileDetails);
      const profileSyncComplete = profileSaved || !hasProfileDetailsToSave;
      setCloudStatus(profileSyncComplete ? "synced" : "error");
      notify(profileSyncComplete
        ? "Your profile and weather settings were saved."
        : "Your account settings were saved; profile details still need the Supabase profile migration.");
      setShowAuth(false);
    } catch (error) {
      console.error("Wearwell profile save failed", error);
      notify("Your profile stays private here, but the cloud save needs another try.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function saveProfileDetails() {
    const normalizedProfile = normalizeProfileDetails(profileDetails);
    const hasProfileDetailsToSave = Object.values(normalizedProfile)
      .some((value) => typeof value === "string" && value.length > 0);
    setProfileDetails(normalizedProfile);
    setSettings((current) => ({ ...current, profileReminderDismissed: true }));

    if (!session?.user) {
      notify("Your profile is saved on this device.");
      return;
    }

    setProfileBusy(true);
    try {
      const profileSaved = await saveCloudProfile(
        session.user,
        options,
        profileName,
        { weatherPermission, weatherLocation },
        normalizedProfile,
      );
      if (profileSaved || !hasProfileDetailsToSave) {
        setCloudStatus("synced");
        notify("Your profile is saved to your account.");
      } else {
        setCloudStatus("error");
        notify("Saved on this device; cloud profile details need the Supabase migration.");
      }
    } catch (error) {
      console.error("Wearwell profile details save failed", error);
      setCloudStatus("error");
      notify("Saved on this device, but account sync needs another try.");
    } finally {
      setProfileBusy(false);
    }
  }

  function updateProfileDetail(field, value) {
    setProfileDetails((current) => ({ ...current, [field]: value }));
  }

  function skipProfileReminder() {
    setSettings((current) => ({ ...current, profileReminderDismissed: true }));
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
    setAuthMode("sign_in");
    setAuthPassword("");
    setAuthPasswordConfirmation("");
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
            <button
              ref={helpButtonRef}
              type="button"
              className="help-button"
              aria-label="How to use Wearwell"
              aria-expanded={helpOpen}
              aria-controls={helpOpen ? "wearwell-help-panel" : undefined}
              title="How to use Wearwell"
              onClick={() => setHelpOpen((open) => !open)}
            >
              ?
            </button>
            {helpOpen && (
              <section
                ref={helpPanelRef}
                id="wearwell-help-panel"
                className="help-popover"
                role="dialog"
                aria-labelledby="wearwell-help-title"
                aria-describedby="wearwell-help-intro"
              >
                <div className="help-popover-header">
                  <div>
                    <p className="eyebrow">QUICK GUIDE</p>
                    <h2 id="wearwell-help-title">How to use Wearwell</h2>
                  </div>
                  <button
                    type="button"
                    className="close-button"
                    data-help-close
                    aria-label="Close help"
                    onClick={() => {
                      setHelpOpen(false);
                      helpButtonRef.current?.focus();
                    }}
                  >
                    ×
                  </button>
                </div>
                <p className="help-popover-intro" id="wearwell-help-intro">
                  Start with your day and the clothes you already own.
                </p>
                <ol className="help-steps">
                  <li>
                    <span className="help-step-number" aria-hidden="true">1</span>
                    <div className="help-step-copy">
                      <strong>Describe your day</strong>
                      Add the event, timing, dress code, movement, or how you want to feel to your brief.
                    </div>
                  </li>
                  <li>
                    <span className="help-step-number" aria-hidden="true">2</span>
                    <div className="help-step-copy">
                      <strong>Add clothes you own</strong>
                      Save a few pieces in My wardrobe so Wearwell has real options to work with.
                    </div>
                  </li>
                  <li>
                    <span className="help-step-number" aria-hidden="true">3</span>
                    <div className="help-step-copy">
                      <strong>Review outfit ideas</strong>
                      Choose See recommendations for two or three looks based on your brief, wardrobe, and available weather.
                    </div>
                  </li>
                  <li>
                    <span className="help-step-number" aria-hidden="true">4</span>
                    <div className="help-step-copy">
                      <strong>Choose or try again</strong>
                      Save a look, regenerate for different choices, and leave feedback in Wear history.
                    </div>
                  </li>
                </ol>
                <div className="help-popover-footer">
                  <p>More pieces in your wardrobe give Wearwell more possibilities.</p>
                  <button
                    type="button"
                    className="understand-button help-popover-action"
                    onClick={() => {
                      setActiveTab("wardrobe");
                      setHelpOpen(false);
                      helpButtonRef.current?.focus();
                    }}
                  >
                    Go to My wardrobe <Icon>→</Icon>
                  </button>
                </div>
              </section>
            )}
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
                {weatherStatus === "permission" && (
                  <>
                    <p className="weather-location-message">Choose a weather location in Settings to see a local forecast.</p>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => setActiveTab("settings")}
                      data-testid="button-open-weather-settings"
                    >
                      Open Settings <Icon>→</Icon>
                    </button>
                  </>
                )}
                {weatherStatus === "fallback" && weatherPermission === "granted" && cloudEnabled && !session?.user && <button type="button" className="text-button" onClick={() => { changeAuthMode("sign_in"); setShowAuth(true); }} data-testid="button-sign-in-for-weather">Sign in for a live forecast <Icon>→</Icon></button>}
              </div>
            </div>

            {showProfileReminder && (
              <aside className="profile-reminder" aria-label="Optional profile reminder">
                <div>
                  <strong>Improve your recommendations</strong>
                  <p>Add any profile details that would help. Every field is optional.</p>
                </div>
                <div className="profile-reminder-actions">
                  <button type="button" onClick={() => setActiveTab("settings")}>Profile &amp; Settings <Icon>→</Icon></button>
                  <button type="button" className="profile-reminder-dismiss" onClick={skipProfileReminder} aria-label="Dismiss profile reminder">Dismiss</button>
                </div>
              </aside>
            )}

            <div className="brief-grid" id="day-brief">
              <div className="brief-panel">
                <div className="panel-label"><span className="status-dot" /> YOUR BRIEF <span className="save-hint">saved privately</span></div>
                 <div className="brief-input-wrap">
                  <textarea
                    value={speechTargetRef.current === "brief" && speechPreview
                      ? [brief.trim(), speechPreview].filter(Boolean).join(" ")
                      : brief}
                    placeholder="Describe your day, including events, timing, or anything your outfit needs."
                    onChange={(event) => handleBriefChange(event.target.value)}
                    readOnly={listening && speechTargetRef.current === "brief"}
                    onKeyDown={(event) => {
                      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                        event.preventDefault();
                        processBrief();
                      }
                    }}
                    aria-label="Describe what your next wear needs"
                  />
                  <div className="brief-actions-stack">
                    <button
                      type="button"
                      className="understand-button brief-process-button"
                      onClick={processBrief}
                      disabled={!brief.trim() || listening || assistantChatBusy}
                      aria-label="Process my brief"
                      title="Process my brief (Ctrl/⌘ + Enter)"
                    >
                      ↵
                    </button>
                    <button
                      type="button"
                      className={listening ? "voice-button listening" : "voice-button"}
                      onClick={handleListen}
                      aria-pressed={listening}
                      aria-label={listening && speechTargetRef.current === "chat"
                        ? "Stop listening to assistant chat"
                        : listening
                          ? "Stop speaking your brief"
                          : "Speak your brief"}
                      title={settings.voiceEnabled ? "Speak your brief" : "Enable browser speech in Settings"}
                    >
                      <span className="voice-ring" />
                      {listening ? "•••" : "◉"}
                    </button>
                  </div>
                </div>
                {listening && speechTargetRef.current === "brief" && (
                  <p className="voice-capture-status" role="status" aria-live="polite">
                    {speechPreview ? "Live transcript — click the microphone to finish." : "Listening… speak your brief."}
                  </p>
                )}
                <div className="speech-actions">
                   <button type="button" className="text-button" onClick={() => handleSpeakText(activeEvent?.brief || brief)} disabled={!settings.voiceEnabled || !(activeEvent?.brief || brief).trim()}>Read event brief aloud</button>
                  {!settings.voiceEnabled && <span>Enable optional browser speech in Settings.</span>}
                </div>
                {settings.voiceEnabled && <p className="voice-privacy-note">Optional browser speech may be processed by your browser or operating system. Review the transcript; audio is not saved by Wearwell.</p>}
                {assistantInputRevision > 0 && !settings.aiEnabled && (
                  <div className="assistant-opt-in-note" role="status">
                    <p>Automatic AI help is off. Your day plan and any available wardrobe looks update locally; optional AI can add an explanation after you enable it in Settings.</p>
                    <button type="button" className="text-button" onClick={() => setActiveTab("settings")}>Review AI settings</button>
                  </div>
                )}
                <div className="brief-bottom">
                  <div className="quick-prompts">
                    <span>Try:</span>
                    {plans.slice(0, 4).map((item) => <button key={item} onClick={() => handlePlanChange(item)} className={plan === item ? "prompt active" : "prompt"}>{item}</button>)}
                  </div>
                  <button
                    type="button"
                    className="assistant-chat-launch"
                    onClick={toggleAssistantChat}
                    aria-expanded={assistantChatOpen}
                    aria-controls="assistant-chat-panel"
                  >
                    <span aria-hidden="true">✳</span>
                    {assistantChatOpen ? "Close chat" : "Talk to Wearwell"}
                  </button>
                  <button className="understand-button" onClick={handleReviewRecommendations}>See recommendations <Icon>→</Icon></button>
                </div>
                {assistantChatOpen && (
                  <section className="assistant-chat" id="assistant-chat-panel" aria-label="Chat with Wearwell">
                    <div className="assistant-chat-header">
                      <div>
                        <strong>Wearwell</strong>
                        <span>No need to have every answer. We’ll take it one step at a time.</span>
                      </div>
                      <div className="assistant-chat-header-actions">
                        {!voiceConversationMode && supabase && (
                          <button
                            type="button"
                            className="text-button assistant-chat-start-voice"
                            onClick={startVoiceConversation}
                            aria-label={assistantChatMessages.length ? "Resume voice chat" : "Start voice chat"}
                          >
                            {assistantChatMessages.length ? "Resume voice chat" : "Start voice chat"}
                          </button>
                        )}
                        {voiceConversationMode && (
                          <button
                            type="button"
                            className="text-button assistant-chat-stop-voice"
                            onClick={() => {
                              stopVoiceConversation();
                              notify("Voice chat stopped. You can continue by typing or resume voice chat.");
                            }}
                          >
                            Stop voice chat
                          </button>
                        )}
                        <button type="button" className="close-button" onClick={toggleAssistantChat} aria-label="Close assistant chat">×</button>
                      </div>
                    </div>
                    {!supabase ? (
                      <div className="assistant-chat-gate" role="status">
                        <p>I can’t connect to chat right now, but you can still add your details in the brief.</p>
                      </div>
                    ) : (
                      <>
                        <p className="assistant-chat-privacy">Your brief and recent messages go to Gemini so I can follow the conversation. Your wardrobe, profile, and weather aren’t sent, and this chat isn’t saved. Please leave out anything sensitive.</p>
                        {voiceConversationMode && (
                          <p
                            className="assistant-chat-voice-status"
                            data-status={voiceConversationStatus}
                            role="status"
                            aria-live="polite"
                          >
                            {voiceConversationStatus === "listening" && "Listening for your reply. Say “stop voice chat” to stop."}
                            {voiceConversationStatus === "speaking" && "Wearwell is speaking."}
                            {voiceConversationStatus === "thinking" && "Wearwell is preparing a reply."}
                          </p>
                        )}
                        {listening && speechTargetRef.current === "chat" && speechPreview && (
                          <p className="assistant-chat-voice-live" role="status" aria-live="polite">
                            Heard so far: {speechPreview}
                          </p>
                        )}
                        {assistantChatFallback && (
                          <p className="assistant-chat-fallback" role="status">AI is unavailable right now. I’ll keep this brief short; you can add any other details in the fields.</p>
                        )}
                        <div className="assistant-chat-log" ref={assistantChatLogRef} role="log" aria-live="polite" aria-relevant="additions">
                          {assistantChatMessages.map((message, index) => (
                            <div className={`assistant-chat-message ${message.role}`} key={`${message.role}-${index}`}>
                              {message.text}
                            </div>
                          ))}
                          {assistantChatBusy && <div className="assistant-chat-typing">Thinking…</div>}
                          {!assistantChatBusy && assistantChatMessages.length === 0 && (
                            <button type="button" className="text-button assistant-chat-start" onClick={startAssistantInterview}>Start the conversation</button>
                          )}
                        </div>
                        {assistantChatError && (
                          <div className="assistant-chat-error" role="alert">
                            <span>{assistantChatError}</span>
                            {assistantChatCurrentField ? (
                              <button type="button" className="text-button" onClick={() => submitAssistantChatReply(assistantChatDraft)}>Retry</button>
                            ) : (
                              <button type="button" className="text-button" onClick={startAssistantInterview}>Try again</button>
                            )}
                          </div>
                        )}
                        {assistantChatComplete ? (
                          <div className="assistant-chat-finished">
                            <p>Your answers have been added to the brief and saved privately. You can edit any detail in the fields alongside it.</p>
                            {visibleOutfits.length === 0 && !excludedItemSets.length ? (
                              <WardrobeGapAssistant
                                plan={wardrobeGapPlan}
                                onOpenWardrobe={() => setActiveTab("wardrobe")}
                                onReviewBrief={handleReviewBrief}
                              />
                            ) : (
                              <button type="button" className="understand-button" onClick={handleReviewRecommendations}>See recommendations <Icon>→</Icon></button>
                            )}
                          </div>
                        ) : assistantChatCurrentField && (
                          <form className="assistant-chat-form" onSubmit={handleAssistantChatSubmit}>
                            <div className="assistant-chat-compose">
                              <input
                                type="text"
                                value={assistantChatDraft}
                                maxLength={500}
                                placeholder="Tell me naturally; include anything that matters…"
                                aria-label="Your answer to the assistant"
                                onChange={(event) => setAssistantChatDraft(event.target.value)}
                                disabled={assistantChatBusy}
                              />
                              <button type="submit" className="understand-button" disabled={assistantChatBusy || !assistantChatDraft.trim()}>Send</button>
                            </div>
                            <button type="button" className="text-button assistant-chat-skip" onClick={() => submitAssistantChatReply("skip this question")} disabled={assistantChatBusy}>Skip this question</button>
                          </form>
                        )}
                      </>
                    )}
                  </section>
                )}
              </div>
              <div className="plan-panel">
                <div className="panel-label">I’M DRESSING FOR <span className="edit-pill">edit</span></div>
                <div className="quick-prompts event-selector" role="group" aria-label="Events in this day plan">
                  <span>Events:</span>
                  {dayPlan.events.map((event) => (
                    <button
                      key={event.id}
                      type="button"
                      className={event.id === activeEventId ? "prompt active" : "prompt"}
                      onClick={() => handleEventChange(event.id)}
                    >
                      {event.dayBrief?.occasion || event.label}
                    </button>
                  ))}
                </div>
                <label className="event-context-field">
                  <span>Active event brief / context</span>
                  <textarea
                    value={activeEvent?.brief || ""}
                    rows={3}
                    aria-label="Describe the active event"
                    onChange={(event) => handleEventBriefChange(event.target.value)}
                  />
                </label>
                <div className="plan-title-row"><strong>{dayBrief.occasion || "Choose an occasion"}</strong><span className="confidence">selected by you <Icon>✓</Icon></span></div>
                <div className="structured-brief-fields" aria-label="Editable day brief">
                   {dayBriefFields.map(({ key, label }) => <label className="structured-brief-field" key={key}><span>{label}</span><input type="text" value={dayBrief[key] || ""} placeholder="Not specified" onChange={(event) => handleDayBriefFieldChange(key, event.target.value)} /></label>)}
                </div>
                <p className="structured-brief-note">Only stated details are filled. The occasion comes from your selection; edit any field or leave it blank.</p>
              </div>
            </div>

            {assistantStatus !== "idle" && (
              <section className="assistant-note" aria-live="polite">
                <div>
                  <strong>{assistantStatus === "loading" ? "Considering this event…" : assistantStatus === "ready" ? "Wearwell’s event explanation" : "AI planning unavailable"}</strong>
                  <p>{assistantStatus === "loading" ? "Your deterministic wardrobe looks remain in control while context is added." : assistantResult?.explanation}</p>
                  {assistantLastQuestion && <p className="assistant-user-question"><b>You asked:</b> {assistantLastQuestion}</p>}
                  {assistantResult?.followUpQuestion && <p className="assistant-question">{assistantResult.followUpQuestion}</p>}
                  {assistantResult?.fields && (
                    <ul className="assistant-suggestions">
                      {dayBriefFields
                        .filter(({ key }) => assistantResult.fields[key] && !dayBrief[key]?.trim())
                        .map(({ key }) => (
                          <li key={key}>
                            <span><b>{assistantFieldLabels[key]}:</b> {assistantResult.fields[key]}</span>
                            <button type="button" className="text-button" onClick={() => applyAssistantSuggestion(key, assistantResult.fields[key])}>Use suggestion</button>
                          </li>
                        ))}
                    </ul>
                  )}
                  {settings.aiEnabled && (
                    <form className="assistant-follow-up" onSubmit={handleAssistantFollowUpSubmit}>
                      <label htmlFor="assistant-follow-up-input">
                        Ask about {activeEvent?.dayBrief?.occasion || activeEvent?.label || "this event"} or request a change
                      </label>
                      <div className="assistant-follow-up-controls">
                        <input
                          id="assistant-follow-up-input"
                          type="text"
                          value={assistantFollowUpDraft}
                          maxLength={300}
                          placeholder="For example: make this look smarter"
                          onChange={(event) => setAssistantFollowUpDraft(event.target.value)}
                        />
                        <button type="submit" className="understand-button" disabled={assistantStatus === "loading" || !assistantFollowUpDraft.trim()}>
                          Send
                        </button>
                      </div>
                      <p>Recognized outfit changes use Wearwell’s deterministic wardrobe controls.</p>
                    </form>
                  )}
                </div>
                <button type="button" className="close-button assistant-dismiss" aria-label="Dismiss AI suggestions" onClick={() => { setAssistantStatus("idle"); setAssistantResult(null); }}>×</button>
              </section>
            )}

             <div className="recommendation-header" id="next-wear-plan">
               <div><p className="eyebrow">YOUR NEXT WEAR, FROM YOUR WARDROBE</p><h2>Looks built from your wardrobe</h2>{regenerationReason && <p className="recommendation-context">Showing a different approach: {regenerationReasons.find(([value]) => value === regenerationReason)?.[1] || "different items"}.</p>}</div>
               <div className="recommendation-controls"><span>{visibleOutfits.length} {visibleOutfits.length === 1 ? "look" : "looks"} ready</span><div className="segmented">{[2, 3].map((count) => <button key={count} className={options === count ? "selected" : ""} onClick={() => handleOptionCountChange(count)}>{count}</button>)}</div><div className="regenerate-wrap"><button className="regenerate-link" onClick={() => setShowRegenerateOptions((current) => !current)} aria-expanded={showRegenerateOptions}><Icon>↻</Icon> regenerate</button>{showRegenerateOptions && <div className="regenerate-menu" role="menu"><p>What should change?</p>{regenerationReasons.map(([value, label]) => <button type="button" key={value} role="menuitem" onClick={() => handleRegenerate(value)}>{label}</button>)}</div>}</div></div>
            </div>

            <div className="outfit-grid">
              {visibleOutfits.length === 0 ? (
                <div className="outfit-empty" role="status">
                  <p className="eyebrow">{recommendationSet.generatedCount > 0 ? "REPLAN YOUR NEXT WEAR" : "A WARDROBE FOUNDATION"}</p>
                   <h3>{recommendationSet.generatedCount > 0 ? (excludedItemSets.length ? "No other valid combination yet" : "No looks match the details recorded") : "No complete combination yet"}</h3>
                   <p>{recommendationSet.generatedCount > 0
                     ? (excludedItemSets.length
                       ? "Wearwell kept the previous combinations and could not find another wardrobe set that clears the same recorded constraints."
                       : "The available combinations conflict with a stated need or are marked unavailable. Review your brief or item details; missing details are never treated as a match or a mismatch.")
                    : "Add a top and a bottom, or a one-piece item. Layers, shoes, and accessories are optional."}</p>
                  {recommendationSet.generatedCount > 0
                    ? <button className="understand-button" onClick={handleReviewBrief}>Review my brief <Icon>→</Icon></button>
                    : <button className="understand-button" onClick={() => { setActiveTab("wardrobe"); openAddItem(); }}>Add a wardrobe piece <Icon>→</Icon></button>}
                </div>
               ) : visibleOutfits.map((outfit, index) => (
                 <article className={selected === outfit.id ? "outfit-card chosen" : "outfit-card"} key={outfit.baseId || outfit.id}>
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
                    <div className="outfit-title"><h3>{outfit.name}</h3>{selected === outfit.id && <span className="chosen-mark">chosen <Icon>✓</Icon></span>}</div>
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
                     <div className="outfit-actions"><button className="choose-button" onClick={() => handleChooseLook(outfit)}>{selected === outfit.id ? "Saved for today" : "Choose this look"} <Icon>→</Icon></button><button className="swap-button" onClick={() => setSwapOutfitId((current) => current === (outfit.baseId || outfit.id) ? null : (outfit.baseId || outfit.id))} aria-expanded={swapOutfitId === (outfit.baseId || outfit.id)}><Icon>↝</Icon> swap a piece</button></div>
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
            {showAddItem && (
              <div className="modal-backdrop" onClick={closeWardrobeEditor}>
                <form
                  className="modal"
                  onSubmit={saveItem}
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="modal-header">
                    <div>
                      <p className="eyebrow">{editingItemId ? "EDIT YOUR WARDROBE" : "ADD TO YOUR WARDROBE"}</p>
                      <h2>{editingItemId ? "Keep the details current" : "A piece you reach for"}</h2>
                    </div>
                    <button type="button" className="close-button" onClick={closeWardrobeEditor}>×</button>
                  </div>

                  <section className="wardrobe-photo-panel">
                    <button
                      type="button"
                      className="photo-panel-toggle"
                      aria-expanded={wardrobePhotoOpen}
                      onClick={() => setWardrobePhotoOpen((open) => !open)}
                    >
                      {wardrobePhotoOpen ? "Hide optional photo suggestions" : "Use a photo (optional)"}
                      <span aria-hidden="true">{wardrobePhotoOpen ? "−" : "+"}</span>
                    </button>
                    {wardrobePhotoOpen && (
                      <div className="wardrobe-photo-content">
                        <p className="photo-privacy-note">
                          Your photo is sent to Wearwell’s signed-in Gemini service only when you choose Analyze.
                          It is not saved to your wardrobe or photo storage. Manual entry always works.
                        </p>
                        <div className="photo-picker-actions">
                          <button
                            type="button"
                            className="photo-picker-button"
                            onClick={() => wardrobeCameraInputRef.current?.click()}
                            disabled={wardrobePhotoBusy}
                          >
                            Take a photo
                          </button>
                          <button
                            type="button"
                            className="photo-picker-button"
                            onClick={() => wardrobeUploadInputRef.current?.click()}
                            disabled={wardrobePhotoBusy}
                          >
                            Upload a photo
                          </button>
                          <input
                            ref={wardrobeCameraInputRef}
                            className="visually-hidden"
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            capture="environment"
                            onChange={selectWardrobePhoto}
                            tabIndex="-1"
                            aria-hidden="true"
                          />
                          <input
                            ref={wardrobeUploadInputRef}
                            className="visually-hidden"
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            onChange={selectWardrobePhoto}
                            tabIndex="-1"
                            aria-hidden="true"
                          />
                        </div>

                        {wardrobePhotoPreview && (
                          <div className="wardrobe-photo-preview">
                            <img src={wardrobePhotoPreview} alt="Preview of the selected clothing photo" />
                            <div>
                              <span>{wardrobePhotoFile?.name || "Selected photo"}</span>
                              <button
                                type="button"
                                className="text-button"
                                onClick={clearWardrobePhoto}
                                disabled={wardrobePhotoBusy}
                              >
                                Remove photo
                              </button>
                            </div>
                          </div>
                        )}

                        {(!session?.user || !supabase || !settings.aiEnabled) && (
                          <p className="photo-privacy-note">
                            {!session?.user
                              ? "Sign in to use photo suggestions. You can continue entering details manually."
                              : !supabase
                                ? "Photo suggestions need a connected Supabase service. Manual entry is still available."
                                : "AI assistance is turned off in settings. Manual entry is still available."}
                          </p>
                        )}
                        {!session?.user && supabase && (
                          <button type="button" className="text-button" onClick={() => setShowAuth(true)}>
                            Sign in to analyze a photo
                          </button>
                        )}
                        {wardrobePhotoFile && (
                          <button
                            type="button"
                            className="understand-button photo-analyze-button"
                            onClick={analyzeWardrobePhoto}
                            disabled={wardrobePhotoBusy || !session?.user || !supabase || !settings.aiEnabled}
                          >
                            {wardrobePhotoBusy ? "Analyzing photo…" : "Analyze photo"}
                          </button>
                        )}
                        {wardrobePhotoError && (
                          <p className="photo-error" role="alert">{wardrobePhotoError}</p>
                        )}

                        {wardrobePhotoSuggestion && (
                          <div className="wardrobe-photo-review" aria-live="polite">
                            <p className="eyebrow">SUGGESTIONS TO REVIEW · NOT SAVED</p>
                            <h3>{wardrobePhotoSuggestion.suggestedName || "No confident item name"}</h3>
                            <dl>
                              <div>
                                <dt>Category</dt>
                                <dd>{wardrobePhotoSuggestion.category === "uncertain" ? "Not sure" : wardrobePhotoSuggestion.category}</dd>
                              </div>
                              <div>
                                <dt>Dominant colour</dt>
                                <dd>
                                  {wardrobePhotoSuggestion.colorName || "Not sure"}
                                  {wardrobePhotoSuggestion.colorHex && (
                                    <span
                                      className="photo-colour-swatch"
                                      style={{ backgroundColor: wardrobePhotoSuggestion.colorHex }}
                                      aria-label={`Suggested colour ${wardrobePhotoSuggestion.colorHex}`}
                                    />
                                  )}
                                </dd>
                              </div>
                              <div>
                                <dt>Pattern</dt>
                                <dd>{wardrobePhotoSuggestion.pattern.replaceAll("-", " ")}</dd>
                              </div>
                              <div>
                                <dt>Visible details</dt>
                                <dd>{wardrobePhotoSuggestion.visibleDetails || "No clear details"}</dd>
                              </div>
                              <div>
                                <dt>Formality</dt>
                                <dd>{wardrobePhotoSuggestion.formality === null
                                  ? "No clear hint"
                                  : ["", "Casual", "Smart-casual", "Formal"][wardrobePhotoSuggestion.formality]}</dd>
                              </div>
                              <div>
                                <dt>Weather</dt>
                                <dd>{wardrobePhotoSuggestion.weatherHint === "unspecified"
                                  ? "No clear hint"
                                  : wardrobePhotoSuggestion.weatherHint === "all"
                                    ? "All-weather"
                                    : `${wardrobePhotoSuggestion.weatherHint}-weather`}</dd>
                              </div>
                            </dl>
                            <p className="photo-confidence">Visual match confidence: {wardrobePhotoSuggestion.confidence}.</p>
                            <p className="photo-privacy-note">
                              Check the suggestions. Fields you already typed will be preserved; you can edit the form before saving.
                            </p>
                            <button
                              type="button"
                              className="understand-button photo-analyze-button"
                              onClick={applyReviewedWardrobeSuggestions}
                              disabled={wardrobePhotoSuggestionsApplied}
                            >
                              {wardrobePhotoSuggestionsApplied ? "Suggestions applied" : "Use these suggestions"}
                            </button>
                            {wardrobePhotoSuggestionsApplied && (
                              <p className="photo-confidence">Applied to the editable form. Review the details, then save when ready.</p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </section>

                  <label>
                    Name
                    <input
                      autoFocus
                      required
                      maxLength="100"
                      value={newItem.name}
                      onChange={(event) => updateWardrobeDraftField("name", event.target.value)}
                      placeholder="e.g. navy shirt"
                    />
                  </label>
                  <div className="wardrobe-form-row">
                    <label>
                      Type
                      <select value={newItem.type} onChange={(event) => updateWardrobeDraftField("type", event.target.value)}>
                        <option>Top</option>
                        <option>Bottom</option>
                        <option>Layer</option>
                        <option>Shoes</option>
                        <option>Accessory</option>
                      </select>
                    </label>
                    <label>
                      Colour name
                      <input
                        maxLength="32"
                        value={newItem.tone}
                        onChange={(event) => updateWardrobeDraftField("tone", event.target.value)}
                        placeholder="Optional"
                      />
                    </label>
                    <label>
                      Colour
                      <input
                        type="color"
                        value={newItem.color}
                        onChange={(event) => updateWardrobeDraftField("color", event.target.value)}
                      />
                    </label>
                    <label>
                      Pattern
                      <select
                        value={newItem.visualAttributes.pattern}
                        onChange={(event) => updateWardrobeDraftField("visualAttributes.pattern", event.target.value)}
                      >
                        <option value="uncertain">Not recorded</option>
                        <option value="solid">Solid</option>
                        <option value="stripes">Stripes</option>
                        <option value="checks">Checks</option>
                        <option value="plaid">Plaid</option>
                        <option value="floral">Floral</option>
                        <option value="graphic">Graphic</option>
                        <option value="textured">Textured</option>
                        <option value="other">Other</option>
                      </select>
                    </label>
                  </div>
                  <label>
                    Visible details (optional)
                    <textarea
                      maxLength="180"
                      value={newItem.visualAttributes.visibleDetails}
                      onChange={(event) => updateWardrobeDraftField("visualAttributes.visibleDetails", event.target.value)}
                      placeholder="e.g. long sleeves, button front"
                      rows="2"
                    />
                  </label>
                  <div className="wardrobe-form-row">
                    <label>
                      Formality (optional)
                      <select
                        value={newItem.formality ?? ""}
                        onChange={(event) => updateWardrobeDraftField("formality", event.target.value ? Number(event.target.value) : null)}
                      >
                        <option value="">Not recorded</option>
                        <option value="1">Casual</option>
                        <option value="2">Smart-casual</option>
                        <option value="3">Formal</option>
                      </select>
                    </label>
                    <label>
                      Typical weather (optional)
                      <select value={newItem.weather} onChange={(event) => updateWardrobeDraftField("weather", event.target.value)}>
                        <option value="all">No preference</option>
                        <option value="hot">Warm weather</option>
                        <option value="cool">Cool weather</option>
                      </select>
                    </label>
                  </div>
                  <label>
                    Fit & comfort note (optional)
                    <textarea
                      maxLength="500"
                      value={newItem.note}
                      onChange={(event) => updateWardrobeDraftField("note", event.target.value)}
                      placeholder="e.g. soft fabric, room to move"
                      rows="3"
                    />
                  </label>
                  <div className="modal-actions">
                    {editingItemId && <button type="button" className="danger-button" onClick={removeItem}>Remove</button>}
                    <button className="understand-button">
                      {editingItemId ? "Save changes" : "Add piece"} <Icon>→</Icon>
                    </button>
                  </div>
                </form>
              </div>
            )}
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
            <div className="view-heading"><div><p className="eyebrow">PREFERENCES</p><h1>Settings</h1><p className="lede">Manage your profile, weather and app preferences.</p></div></div>
            <div className="settings-grid">
              <section className="setting-card weather-location-card">
              <p className="eyebrow">LOCAL FORECAST</p>
              <h2>Weather location</h2>
              <p className="weather-location-status" role="status" data-testid="status-weather-location">
                {locationMessage || (
                  !cloudEnabled
                    ? "Weather service isn't configured."
                    : weatherPermission === "granted" && weatherLocation
                      ? "Location is ready for local weather."
                      : weatherPermission === "denied"
                        ? "Location is off. Check browser permissions to try again."
                        : "No location shared."
                )}
              </p>
              <p>Share approximate location for a local forecast.</p>
              <details className="setting-disclosure">
                <summary>Location privacy</summary>
                <p>Coordinates are rounded before use. When signed in, the approximate location is saved with your account and sent to the weather service.</p>
              </details>
              {weatherPermission === "granted" && weatherLocation ? (
                <button
                  type="button"
                  className="text-button"
                  onClick={disableWeatherLocation}
                  disabled={locationBusy}
                  data-testid="button-disable-weather"
                >
                  {locationBusy ? "Turning off…" : "Turn off weather location"}
                </button>
              ) : (
                <button
                  type="button"
                  className="understand-button full-width location-settings-action"
                  onClick={requestWeatherLocation}
                  disabled={locationBusy || !cloudEnabled}
                  data-testid="button-settings-use-location"
                >
                  {locationBusy ? "Finding your location…" : "Use my location"}
                </button>
              )}
              </section>
              <section className="setting-card">
                <p className="eyebrow">SPEECH</p>
                <h2>Voice input</h2>
                <label className="setting-toggle">
                  <input type="checkbox" checked={settings.voiceEnabled} onChange={(event) => updateSettings("voiceEnabled", event.target.checked)} />
                  <span>Enable speech input and read aloud</span>
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
                <label className="setting-field">Read-aloud voice
                  <select
                    value={speechVoiceOptions.some((voice) => speechVoiceId(voice) === settings.speechVoiceId)
                      ? settings.speechVoiceId
                      : ""}
                    onChange={(event) => updateSettings("speechVoiceId", event.target.value)}
                    disabled={!settings.voiceEnabled}
                  >
                    <option value="">Device default</option>
                    {speechVoiceOptions.map((voice) => (
                      <option key={speechVoiceId(voice)} value={speechVoiceId(voice)}>
                        {voice.name}{voice.lang ? ` (${voice.lang})` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="text-button"
                  onClick={handleTestSpeechVoice}
                  disabled={!settings.voiceEnabled}
                  data-testid="button-test-speech-voice"
                >
                  Test selected voice
                </button>
                <p>Choose the device default or up to two additional installed voices, for up to three choices. Available voices depend on your browser and speech language. Audio isn’t saved.</p>
              </section>
              <section className="setting-card">
                <p className="eyebrow">OPTIONAL AI</p>
                <h2>Automatic planning</h2>
                <label className="setting-toggle">
                  <input type="checkbox" checked={settings.aiEnabled} onChange={(event) => updateSettings("aiEnabled", event.target.checked)} />
                  <span>Get AI help after describing an event</span>
                </label>
                <p>Uses your event details and one selected look. Profile details are shared only if you allow it.</p>
                <details className="setting-disclosure">
                  <summary>AI data use</summary>
                  <p>Automatic planning may send your event brief, occasion, time, language, live weather, follow-up and one selected look. Only nonblank profile details are sent if you allow sharing. Your full wardrobe, audio and wear history aren’t sent; AI can’t change your chosen look.</p>
                  <p>Assistant chat sends your brief and recent chat turns to Gemini. Chats aren’t saved, and your wardrobe, profile and weather aren’t sent. Avoid sharing sensitive information.</p>
                  <p>Automatic planning requires sign-in. Core outfit recommendations work without AI.</p>
                </details>
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
                <p>Display only; outfit scoring stays in °C.</p>
              </section>
            </div>
            <ProfileSettings
              profile={profileDetails}
              onChange={updateProfileDetail}
              onSave={saveProfileDetails}
              onSkip={skipProfileReminder}
              busy={profileBusy}
              isSignedIn={Boolean(session?.user)}
              shareProfileWithAi={Boolean(settings.shareProfileWithAi)}
              onShareProfileWithAiChange={(value) => setSettings((current) => ({
                ...current,
                shareProfileWithAi: value,
              }))}
            />
          </section>
        )}
      </main>
      {toast && <div className="toast"><Icon>✦</Icon>{toast}</div>}
      {showAuth && (
        <AuthModal
          session={session}
          cloudEnabled={cloudEnabled}
          authMode={authMode}
          onAuthModeChange={changeAuthMode}
          authEmail={authEmail}
          onAuthEmailChange={setAuthEmail}
          authPassword={authPassword}
          onAuthPasswordChange={setAuthPassword}
          authPasswordConfirmation={authPasswordConfirmation}
          onAuthPasswordConfirmationChange={setAuthPasswordConfirmation}
          profileName={profileName}
          onProfileNameChange={setProfileName}
          authMessage={authMessage}
          authBusy={authBusy}
          onAuthSubmit={handlePasswordAuth}
          onPasswordResetRequest={sendPasswordRecovery}
          onPasswordUpdate={updateRecoveredPassword}
          onSaveProfile={saveProfile}
          onSignOut={signOut}
          onClose={() => setShowAuth(false)}
        />
      )}
    </div>
  );
}


export default App;
