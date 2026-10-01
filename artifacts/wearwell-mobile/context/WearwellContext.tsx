import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
// @ts-ignore Shared project module is JavaScript without a local declaration.
import { normalizeProfileDetails } from '../../../src/profile.mjs';
// @ts-ignore Shared day-plan helpers are plain JavaScript modules.
import {
  eventStateFor,
  normalizeDayPlan,
  parseDayPlan,
  updateDayPlanEvent,
} from '../../../src/dayPlan.mjs';
import {
  restoreSelectedRecommendation,
  selectRecommendation,
} from '@/lib/coreBridge';
import { useMobileCloudSync } from '@/hooks/useMobileCloudSync';

const STORAGE_KEY = 'wearwell-mobile-local-state-v1';
const MAX_HISTORY = 200;

export type WardrobeItem = {
  id: string;
  _cloudId?: string;
  name: string;
  type: string;
  tone: string;
  color: string;
  icon?: string;
  formality?: number | null;
  formalityExplicit?: boolean;
  weather?: string;
  note?: string;
  comfort?: string;
  fitNote?: string;
  coverage?: string;
  available?: boolean;
  visualAttributes?: Record<string, any>;
};

export type WeatherLocation = {
  latitude: number;
  longitude: number;
  label: string;
};

export type WeatherSnapshot = {
  tempC: number;
  apparentC: number | null;
  condition: string;
  rainProbability: number | null;
  windKph: number | null;
  fetchedAt: string;
};

export type FeedbackKey =
  | 'woreIt'
  | 'comfort'
  | 'likedColors'
  | 'wouldWearAgain';
export type FeedbackValue =
  | ''
  | 'yes'
  | 'no'
  | 'not-yet'
  | 'good'
  | 'could-improve';

export type WearHistoryEntry = {
  id: string;
  createdAt: string;
  eventId?: string;
  eventLabel?: string;
  outfitId: string;
  outfitName: string;
  itemIds: string[];
  itemNames: string[];
  reason: string;
  weather: string;
  formality: string;
  dayBrief: Record<string, string>;
  feedback: Record<FeedbackKey, FeedbackValue>;
};

export type WearwellState = {
  wardrobe: WardrobeItem[];
  brief: string;
  selected: string | null;
  wearHistory: WearHistoryEntry[];
  dayPlan: any;
  localOwnerId: string | null;
  profile: {
    displayName: string;
    profileDetails: Record<string, any>;
    shareProfileWithAi: boolean;
  };
  settings: {
    temperatureUnit: 'C' | 'F';
    recommendationCount: 2 | 3;
    location: WeatherLocation | null;
    aiEnabled: boolean;
    speechEnabled: boolean;
    aiSpeechDefaultsVersion: number;
    voiceLanguage: string;
    speechVoiceId: string;
  };
  weather: WeatherSnapshot | null;
};

const INITIAL_STATE: WearwellState = {
  wardrobe: [],
  brief: '',
  selected: null,
  wearHistory: [],
  dayPlan: null,
  localOwnerId: null,
  profile: {
    displayName: '',
    profileDetails: normalizeProfileDetails({}),
    shareProfileWithAi: false,
  },
  settings: {
    temperatureUnit: 'C',
    recommendationCount: 3,
    location: null,
    aiEnabled: true,
    speechEnabled: true,
    aiSpeechDefaultsVersion: 1,
    voiceLanguage: 'en-GB',
    speechVoiceId: '',
  },
  weather: null,
};

type WeatherActionResult = {
  ok: boolean;
  needsSettings?: boolean;
};

type WearwellContextValue = {
  state: WearwellState;
  isHydrated: boolean;
  storageError: string;
  cloudSyncStatus: 'offline' | 'loading' | 'saving' | 'synced' | 'error';
  cloudSyncError: string;
  weatherError: string;
  weatherLoading: boolean;
  permissionNeedsSettings: boolean;
  setBrief: (brief: string) => void;
  setActiveDayEvent: (eventId: string) => void;
  updateDayEvent: (eventId: string, changes: Record<string, any>) => void;
  saveWardrobeItem: (item: WardrobeItem) => void;
  removeWardrobeItem: (id: string) => void;
  setAvailability: (id: string, available: boolean) => void;
  saveLook: (outfit: any, dayBrief: Record<string, string>) => void;
  updateFeedback: (
    entryId: string,
    key: FeedbackKey,
    value: FeedbackValue,
  ) => void;
  clearHistory: () => void;
  setTemperatureUnit: (unit: 'C' | 'F') => void;
  setRecommendationCount: (count: 2 | 3) => void;
  setAiEnabled: (enabled: boolean) => void;
  setSpeechEnabled: (enabled: boolean) => void;
  setVoiceLanguage: (language: string) => void;
  setSpeechVoiceId: (voiceId: string) => void;
  setDisplayName: (name: string) => void;
  setProfileDetails: (details: Record<string, any>) => void;
  setShareProfileWithAi: (enabled: boolean) => void;
  retryCloudSync: () => void;
  enableWeather: () => Promise<WeatherActionResult>;
  refreshWeather: () => Promise<WeatherActionResult>;
  disableWeather: () => void;
  clearAllData: () => Promise<void>;
};

const WearwellContext = createContext<WearwellContextValue | null>(null);

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanWardrobeItem(value: unknown): WardrobeItem | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    !value.name.trim() ||
    typeof value.type !== 'string' ||
    typeof value.color !== 'string'
  ) {
    return null;
  }

  // Explicit allowlist: photos, base64 data, and raw model responses are never
  // restored or written to mobile local storage.
  return {
    id: value.id.slice(0, 160),
    name: value.name.trim().slice(0, 120),
    type: value.type.slice(0, 40),
    tone: typeof value.tone === 'string' ? value.tone.slice(0, 40) : '',
    color: value.color.slice(0, 32),
    ...(typeof value.icon === 'string' ? { icon: value.icon.slice(0, 12) } : {}),
    ...(typeof value.formality === 'number' ? { formality: value.formality } : {}),
    ...(typeof value.formalityExplicit === 'boolean'
      ? { formalityExplicit: value.formalityExplicit }
      : {}),
    ...(typeof value.weather === 'string' ? { weather: value.weather.slice(0, 40) } : {}),
    ...(typeof value.note === 'string' ? { note: value.note.slice(0, 300) } : {}),
    ...(typeof value.comfort === 'string' ? { comfort: value.comfort.slice(0, 160) } : {}),
    ...(typeof value.fitNote === 'string' ? { fitNote: value.fitNote.slice(0, 160) } : {}),
    ...(typeof value.coverage === 'string' ? { coverage: value.coverage.slice(0, 160) } : {}),
    ...(typeof value.available === 'boolean' ? { available: value.available } : {}),
    ...(typeof value._cloudId === 'string' ? { _cloudId: value._cloudId.slice(0, 180) } : {}),
    ...(isRecord(value.visualAttributes)
      ? {
          visualAttributes: {
            pattern:
              typeof value.visualAttributes.pattern === 'string'
                ? value.visualAttributes.pattern.slice(0, 40)
                : 'uncertain',
            visibleDetails:
              typeof value.visualAttributes.visibleDetails === 'string'
                ? value.visualAttributes.visibleDetails.slice(0, 180)
                : '',
            formalityConfirmed: value.visualAttributes.formalityConfirmed === true,
          },
        }
      : {}),
  };
}

function cleanHistory(value: unknown): WearHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (entry) =>
        isRecord(entry) &&
        typeof entry.id === 'string' &&
        typeof entry.outfitId === 'string' &&
        Array.isArray(entry.itemIds),
    )
    .slice(-MAX_HISTORY)
    .map((entry) => ({
      id: String(entry.id).slice(0, 180),
      createdAt: typeof entry.createdAt === 'string' ? entry.createdAt.slice(0, 80) : '',
      eventId: typeof entry.eventId === 'string' ? entry.eventId.slice(0, 80) : '',
      eventLabel: typeof entry.eventLabel === 'string' ? entry.eventLabel.slice(0, 120) : '',
      outfitId: String(entry.outfitId).slice(0, 180),
      outfitName: typeof entry.outfitName === 'string' ? entry.outfitName.slice(0, 120) : 'Saved look',
      itemIds: entry.itemIds
        .filter((id: unknown) => typeof id === 'string')
        .slice(0, 12)
        .map((id: string) => id.slice(0, 160)),
      itemNames: Array.isArray(entry.itemNames)
        ? entry.itemNames.filter((name: unknown) => typeof name === 'string').slice(0, 12)
        : [],
      reason: typeof entry.reason === 'string' ? entry.reason.slice(0, 400) : '',
      weather: typeof entry.weather === 'string' ? entry.weather.slice(0, 300) : '',
      formality: typeof entry.formality === 'string' ? entry.formality.slice(0, 240) : '',
      dayBrief: isRecord(entry.dayBrief) ? entry.dayBrief : {},
      feedback: {
        woreIt: entry.feedback?.woreIt || '',
        comfort: entry.feedback?.comfort || '',
        likedColors: entry.feedback?.likedColors || '',
        wouldWearAgain: entry.feedback?.wouldWearAgain || '',
      },
    }));
}

function cleanWeather(value: unknown): WeatherSnapshot | null {
  if (!isRecord(value) || typeof value.tempC !== 'number' || !Number.isFinite(value.tempC)) {
    return null;
  }
  return {
    tempC: value.tempC,
    apparentC: typeof value.apparentC === 'number' ? value.apparentC : null,
    condition: typeof value.condition === 'string' ? value.condition.slice(0, 80) : 'Current conditions',
    rainProbability:
      typeof value.rainProbability === 'number' ? value.rainProbability : null,
    windKph: typeof value.windKph === 'number' ? value.windKph : null,
    fetchedAt: typeof value.fetchedAt === 'string' ? value.fetchedAt.slice(0, 80) : '',
  };
}

function normalizeState(value: unknown): WearwellState {
  if (!isRecord(value)) return INITIAL_STATE;
  const savedLocation = isRecord(value.settings?.location)
    ? value.settings.location
    : null;
  const latitude = Number(savedLocation?.latitude);
  const longitude = Number(savedLocation?.longitude);
  const wearHistory = cleanHistory(value.wearHistory);
  const hasCurrentAiSpeechDefaults = value.settings?.aiSpeechDefaultsVersion === 1;
  const selected =
    typeof value.selected === 'string'
      ? restoreSelectedRecommendation(
          { selected: value.selected, wearHistory },
          new Date(),
          'today',
        )
      : null;

  return {
    wardrobe: Array.isArray(value.wardrobe)
      ? value.wardrobe.map(cleanWardrobeItem).filter(Boolean) as WardrobeItem[]
      : [],
    brief: typeof value.brief === 'string' ? value.brief.slice(0, 1200) : '',
    selected,
    wearHistory,
    dayPlan: normalizeDayPlan(value.dayPlan, {
      fallbackBrief: typeof value.brief === 'string' ? value.brief : '',
    }),
    localOwnerId:
      typeof value.localOwnerId === 'string' ? value.localOwnerId.slice(0, 160) : null,
    profile: {
      displayName:
        typeof value.profile?.displayName === 'string'
          ? value.profile.displayName.slice(0, 120)
          : '',
      profileDetails: normalizeProfileDetails(value.profile?.profileDetails),
      shareProfileWithAi: value.profile?.shareProfileWithAi === true,
    },
    settings: {
      temperatureUnit: value.settings?.temperatureUnit === 'F' ? 'F' : 'C',
      recommendationCount:
        value.settings?.recommendationCount === 2 ? 2 : 3,
      aiEnabled: hasCurrentAiSpeechDefaults
        ? value.settings?.aiEnabled !== false
        : true,
      speechEnabled: hasCurrentAiSpeechDefaults
        ? value.settings?.speechEnabled !== false
        : true,
      aiSpeechDefaultsVersion: 1,
      voiceLanguage:
        typeof value.settings?.voiceLanguage === 'string'
          ? value.settings.voiceLanguage.slice(0, 16)
          : 'en-GB',
      speechVoiceId:
        typeof value.settings?.speechVoiceId === 'string'
          ? value.settings.speechVoiceId.slice(0, 240)
          : '',
      location:
        Number.isFinite(latitude) &&
        latitude >= -90 &&
        latitude <= 90 &&
        Number.isFinite(longitude) &&
        longitude >= -180 &&
        longitude <= 180
          ? { latitude, longitude, label: 'Near you' }
          : null,
    },
    weather: cleanWeather(value.weather),
  };
}

function describeWeatherCode(code: number): string {
  if (code === 0) return 'Clear sky';
  if (code === 1) return 'Mostly clear';
  if (code === 2) return 'Partly cloudy';
  if (code === 3) return 'Overcast';
  if (code === 45 || code === 48) return 'Fog';
  if (code >= 51 && code <= 57) return 'Drizzle';
  if (code >= 61 && code <= 67) return 'Rain';
  if (code >= 71 && code <= 77) return 'Snow';
  if (code >= 80 && code <= 82) return 'Rain showers';
  if (code >= 95) return 'Thunderstorm';
  return 'Current conditions';
}

function currentRainProbability(hourly: any, currentTime: string): number | null {
  if (!Array.isArray(hourly?.time) || !Array.isArray(hourly?.precipitation_probability)) {
    return null;
  }
  const hour = currentTime.slice(0, 13);
  const index = hourly.time.findIndex((time: unknown) =>
    typeof time === 'string' && time.slice(0, 13) === hour,
  );
  const probability = index >= 0 ? Number(hourly.precipitation_probability[index]) : NaN;
  return Number.isFinite(probability) ? probability : null;
}

async function fetchWeather(latitude: number, longitude: number): Promise<WeatherSnapshot> {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m',
    hourly: 'precipitation_probability',
    forecast_days: '1',
    timezone: 'auto',
  });
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
  if (!response.ok) throw new Error('The weather service did not respond. Try again in a moment.');
  const data = await response.json();
  const current = data?.current;
  if (typeof current?.temperature_2m !== 'number' || !Number.isFinite(current.temperature_2m)) {
    throw new Error('The weather service returned an incomplete forecast. Try again later.');
  }
  const code = Number(current.weather_code);

  return {
    tempC: current.temperature_2m,
    apparentC:
      typeof current.apparent_temperature === 'number' ? current.apparent_temperature : null,
    condition: Number.isFinite(code) ? describeWeatherCode(code) : 'Current conditions',
    rainProbability: currentRainProbability(data?.hourly, String(current.time || '')),
    windKph: typeof current.wind_speed_10m === 'number' ? current.wind_speed_10m : null,
    fetchedAt: new Date().toISOString(),
  };
}

export function WearwellProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WearwellState>(INITIAL_STATE);
  const [isHydrated, setIsHydrated] = useState(false);
  const [storageError, setStorageError] = useState('');
  const [weatherError, setWeatherError] = useState('');
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [permissionNeedsSettings, setPermissionNeedsSettings] = useState(false);
  const cloudSync = useMobileCloudSync({ state, setState, isHydrated });

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (cancelled) return;
        if (saved) setState(normalizeState(JSON.parse(saved)));
      })
      .catch(() => {
        if (!cancelled) setStorageError('Saved data could not be read from this device.');
      })
      .finally(() => {
        if (!cancelled) setIsHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeState(state)))
      .then(() => setStorageError(''))
      .catch(() => setStorageError('Changes could not be saved on this device.'));
  }, [isHydrated, state]);

  const setBrief = useCallback((brief: string) => {
    const nextBrief = brief.slice(0, 1200);
    setState((current) => {
      const plan = normalizeDayPlan(current.dayPlan, {
        fallbackBrief: current.brief,
      });
      const activeEvent = eventStateFor(plan, plan.activeEventId);
      return {
        ...current,
        brief: nextBrief,
        dayPlan: (parseDayPlan as any)(nextBrief, activeEvent?.label || '', plan),
      };
    });
  }, []);

  const setActiveDayEvent = useCallback((eventId: string) => {
    setState((current) => {
      const plan = normalizeDayPlan(current.dayPlan, {
        fallbackBrief: current.brief,
      });
      if (!plan.events.some((event: any) => event.id === eventId)) return current;
      return {
        ...current,
        dayPlan: { ...plan, activeEventId: eventId },
      };
    });
  }, []);

  const updateDayEvent = useCallback(
    (eventId: string, changes: Record<string, any>) => {
      setState((current) => {
        const plan = normalizeDayPlan(current.dayPlan, {
          fallbackBrief: current.brief,
        });
        if (!plan.events.some((event: any) => event.id === eventId)) return current;
        return {
          ...current,
          dayPlan: normalizeDayPlan(
            updateDayPlanEvent(plan, eventId, (event: any) => ({
              ...event,
              ...changes,
            })),
            { fallbackBrief: current.brief },
          ),
        };
      });
    },
    [],
  );

  const saveWardrobeItem = useCallback((item: WardrobeItem) => {
    const cleanItem = cleanWardrobeItem(item);
    if (!cleanItem) return;
    setState((current) => {
      const existing = current.wardrobe.some((entry) => entry.id === cleanItem.id);
      return {
        ...current,
        wardrobe: existing
          ? current.wardrobe.map((entry) => (entry.id === cleanItem.id ? cleanItem : entry))
          : [...current.wardrobe, cleanItem],
      };
    });
  }, []);

  const removeWardrobeItem = useCallback((id: string) => {
    const item = state.wardrobe.find((entry) => entry.id === id);
    if (item) void cloudSync.removeCloudWardrobeItem(item);
    setState((current) => ({
      ...current,
      wardrobe: current.wardrobe.filter((item) => item.id !== id),
      selected: null,
    }));
  }, [state.wardrobe, cloudSync.removeCloudWardrobeItem]);

  const setAvailability = useCallback((id: string, available: boolean) => {
    setState((current) => ({
      ...current,
      wardrobe: current.wardrobe.map((item) =>
        item.id === id ? { ...item, available } : item,
      ),
    }));
  }, []);

  const saveLook = useCallback(
    (outfit: any, dayBrief: Record<string, string>) => {
      setState((current) => {
        const dayPlan = normalizeDayPlan(current.dayPlan, {
          fallbackBrief: current.brief,
        });
        const activeEvent = eventStateFor(dayPlan, dayPlan.activeEventId);
        const eventId = activeEvent?.id || 'event-1';
        const eventLabel = activeEvent?.label || 'Today';
        const result = selectRecommendation(current, outfit, {
          dayBrief,
          wardrobeById: Object.fromEntries(current.wardrobe.map((item) => [item.id, item])),
          now: new Date(),
          eventId,
          eventLabel,
        });
        return {
          ...current,
          selected: result.selected || outfit.id,
          wearHistory: cleanHistory(result.wearHistory),
          dayPlan: updateDayPlanEvent(dayPlan, eventId, (event: any) => ({
            ...event,
            selectedRecommendation: result.selected || outfit.id,
          })),
        };
      });
    },
    [],
  );

  const updateFeedback = useCallback(
    (entryId: string, key: FeedbackKey, value: FeedbackValue) => {
      setState((current) => ({
        ...current,
        wearHistory: current.wearHistory.map((entry) =>
          entry.id === entryId
            ? { ...entry, feedback: { ...entry.feedback, [key]: value } }
            : entry,
        ),
      }));
    },
    [],
  );

  const setTemperatureUnit = useCallback((unit: 'C' | 'F') => {
    setState((current) => ({
      ...current,
      settings: { ...current.settings, temperatureUnit: unit },
    }));
  }, []);

  const setRecommendationCount = useCallback((count: 2 | 3) => {
    setState((current) => ({
      ...current,
      settings: { ...current.settings, recommendationCount: count },
    }));
  }, []);

  const setAiEnabled = useCallback((enabled: boolean) => {
    setState((current) => ({
      ...current,
      settings: {
        ...current.settings,
        aiEnabled: enabled,
        aiSpeechDefaultsVersion: 1,
      },
    }));
  }, []);

  const setSpeechEnabled = useCallback((enabled: boolean) => {
    setState((current) => ({
      ...current,
      settings: {
        ...current.settings,
        speechEnabled: enabled,
        aiSpeechDefaultsVersion: 1,
      },
    }));
  }, []);

  const setVoiceLanguage = useCallback((language: string) => {
    setState((current) => ({
      ...current,
      settings: {
        ...current.settings,
        voiceLanguage: language.slice(0, 16),
        speechVoiceId: '',
      },
    }));
  }, []);

  const setSpeechVoiceId = useCallback((voiceId: string) => {
    setState((current) => ({
      ...current,
      settings: {
        ...current.settings,
        speechVoiceId: voiceId.slice(0, 240),
      },
    }));
  }, []);

  const setDisplayName = useCallback((name: string) => {
    setState((current) => ({
      ...current,
      profile: { ...current.profile, displayName: name.slice(0, 120) },
    }));
  }, []);

  const setProfileDetails = useCallback((details: Record<string, any>) => {
    setState((current) => ({
      ...current,
      profile: {
        ...current.profile,
        profileDetails: normalizeProfileDetails(details),
      },
    }));
  }, []);

  const setShareProfileWithAi = useCallback((enabled: boolean) => {
    setState((current) => ({
      ...current,
      profile: { ...current.profile, shareProfileWithAi: enabled },
    }));
  }, []);

  const clearHistory = useCallback(() => {
    setState((current) => ({
      ...current,
      selected: null,
      wearHistory: [],
    }));
  }, []);

  const loadWeather = useCallback(async (requestPermission: boolean) => {
    setWeatherLoading(true);
    setWeatherError('');
    setPermissionNeedsSettings(false);
    try {
      let permission = await Location.getForegroundPermissionsAsync();
      if (!permission.granted && requestPermission && permission.canAskAgain) {
        permission = await Location.requestForegroundPermissionsAsync();
      }
      if (!permission.granted) {
        const needsSettings = !permission.canAskAgain;
        setPermissionNeedsSettings(needsSettings);
        setWeatherError(
          needsSettings
            ? 'Location access is off. You can turn it on in your device settings, or keep using Wearwell without a forecast.'
            : 'Weather is optional. Allow location access for a local forecast, or keep using Wearwell without it.',
        );
        if (requestPermission) {
          setState((current) => ({
            ...current,
            settings: { ...current.settings, location: null },
            weather: null,
          }));
        }
        return { ok: false, needsSettings };
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Low,
      });
      const latitude = Number(position.coords.latitude.toFixed(2));
      const longitude = Number(position.coords.longitude.toFixed(2));
      const forecast = await fetchWeather(latitude, longitude);

      setState((current) => ({
        ...current,
        settings: {
          ...current.settings,
          location: { latitude, longitude, label: 'Near you' },
        },
        weather: forecast,
      }));
      return { ok: true };
    } catch (error) {
      setWeatherError(
        error instanceof Error && error.message
          ? error.message
          : 'Weather could not be refreshed. Try again later.',
      );
      return { ok: false };
    } finally {
      setWeatherLoading(false);
    }
  }, []);

  const enableWeather = useCallback(() => loadWeather(true), [loadWeather]);
  const refreshWeather = useCallback(() => loadWeather(false), [loadWeather]);

  const disableWeather = useCallback(() => {
    setState((current) => ({
      ...current,
      settings: { ...current.settings, location: null },
      weather: null,
    }));
    setWeatherError('');
    setPermissionNeedsSettings(false);
  }, []);

  const clearAllData = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
      setState((current) => ({
        ...INITIAL_STATE,
        localOwnerId: current.localOwnerId,
      }));
      setStorageError('');
      disableWeather();
    } catch {
      setStorageError('Local data could not be cleared. Please try again.');
    }
  }, [disableWeather]);

  const value = useMemo<WearwellContextValue>(
    () => ({
      state,
      isHydrated,
      storageError,
      cloudSyncStatus: cloudSync.status,
      cloudSyncError: cloudSync.error,
      weatherError,
      weatherLoading,
      permissionNeedsSettings,
      setBrief,
      setActiveDayEvent,
      updateDayEvent,
      saveWardrobeItem,
      removeWardrobeItem,
      setAvailability,
      saveLook,
      updateFeedback,
      clearHistory,
      setTemperatureUnit,
      setRecommendationCount,
      setAiEnabled,
      setSpeechEnabled,
      setVoiceLanguage,
      setSpeechVoiceId,
      setDisplayName,
      setProfileDetails,
      setShareProfileWithAi,
      retryCloudSync: cloudSync.retry,
      enableWeather,
      refreshWeather,
      disableWeather,
      clearAllData,
    }),
    [
      state,
      isHydrated,
      storageError,
      cloudSync.status,
      cloudSync.error,
      weatherError,
      weatherLoading,
      permissionNeedsSettings,
      setBrief,
      setActiveDayEvent,
      updateDayEvent,
      saveWardrobeItem,
      removeWardrobeItem,
      setAvailability,
      saveLook,
      updateFeedback,
      clearHistory,
      setTemperatureUnit,
      setRecommendationCount,
      setAiEnabled,
      setSpeechEnabled,
      setVoiceLanguage,
      setSpeechVoiceId,
      setDisplayName,
      setProfileDetails,
      setShareProfileWithAi,
      cloudSync.retry,
      enableWeather,
      refreshWeather,
      disableWeather,
      clearAllData,
    ],
  );

  return <WearwellContext.Provider value={value}>{children}</WearwellContext.Provider>;
}

export function useWearwell() {
  const context = useContext(WearwellContext);
  if (!context) throw new Error('useWearwell must be used inside WearwellProvider.');
  return context;
}