import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { useAuth } from '@/context/AuthContext';
// @ts-ignore Shared project modules are JavaScript without local declarations.
import { loadCloudAppState, saveCloudAppState } from '../../../src/cloudState.js';
// @ts-ignore Shared project modules are JavaScript without local declarations.
import {
  createCloudWardrobeItem,
  deleteCloudWardrobeItem,
  listCloudWardrobeItems,
  loadCloudProfile,
  saveCloudProfile,
  updateCloudWardrobeItem,
} from '../../../src/cloudWardrobe.js';
// @ts-ignore Shared project module is JavaScript without a local declaration.
import { normalizeProfileDetails } from '../../../src/profile.mjs';
import { extractDayBrief } from '@/lib/coreBridge';

export type CloudSyncStatus = 'offline' | 'loading' | 'saving' | 'synced' | 'error';

type CloudState = {
  wardrobe: Array<Record<string, any>>;
  brief: string;
  selected: string | null;
  wearHistory: Array<Record<string, any>>;
  settings: Record<string, any>;
  profile: {
    displayName: string;
    profileDetails: Record<string, any>;
    shareProfileWithAi: boolean;
  };
  dayPlan?: any;
  localOwnerId?: string | null;
};

const EMPTY_STATE = {
  wardrobe: [],
  brief: '',
  selected: null,
  wearHistory: [],
  settings: {
    temperatureUnit: 'C',
    recommendationCount: 3,
    location: null,
    aiEnabled: false,
    speechEnabled: false,
    voiceLanguage: 'en-GB',
  },
  profile: {
    displayName: '',
    profileDetails: {},
    shareProfileWithAi: false,
  },
  dayPlan: null,
  localOwnerId: null,
};

function mergeById<T extends { id?: string }>(local: T[], remote: T[]) {
  const merged = new Map<string, T>();
  for (const entry of local) {
    if (typeof entry?.id === 'string') merged.set(entry.id, entry);
  }
  for (const entry of remote) {
    if (typeof entry?.id === 'string') merged.set(entry.id, entry);
  }
  return Array.from(merged.values()).slice(-200);
}

export function useMobileCloudSync({
  state,
  setState,
  isHydrated,
}: {
  state: CloudState;
  setState: Dispatch<SetStateAction<any>>;
  isHydrated: boolean;
}) {
  const { session, isLoading: authLoading, cloudEnabled } = useAuth();
  const [status, setStatus] = useState<CloudSyncStatus>('offline');
  const [error, setError] = useState('');
  const [retryNumber, setRetryNumber] = useState(0);
  const [readyUserId, setReadyUserId] = useState<string | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const retry = useCallback(() => {
    setRetryNumber((value) => value + 1);
  }, []);

  const removeCloudWardrobeItem = useCallback(async (item: Record<string, any>) => {
    if (!item?._cloudId) return;
    try {
      await deleteCloudWardrobeItem(item);
    } catch (syncError) {
      setStatus('error');
      setError(
        syncError instanceof Error
          ? syncError.message
          : 'The wardrobe item could not be removed from cloud storage.',
      );
    }
  }, []);

  useLayoutEffect(() => {
    const userId = session?.user?.id;
    const currentOwnerId = stateRef.current.localOwnerId;
    if (
      !isHydrated ||
      !userId ||
      !currentOwnerId ||
      currentOwnerId === userId
    ) {
      return;
    }

    // Do not render another account's cached wardrobe or profile while the new
    // account's cloud state is loading.
    setState({ ...EMPTY_STATE, localOwnerId: userId });
  }, [isHydrated, session?.user?.id, setState]);

  useEffect(() => {
    const user = session?.user;
    const userId = user?.id;
    setReadyUserId(null);

    if (authLoading || !isHydrated || !cloudEnabled || !user || !userId) {
      setStatus('offline');
      setError('');
      return;
    }

    let cancelled = false;
    const localState =
      stateRef.current.localOwnerId &&
      stateRef.current.localOwnerId !== userId
        ? EMPTY_STATE
        : stateRef.current;
    setStatus('loading');
    setError('');

    (async () => {
      const [cloudApp, remoteWardrobe, cloudProfile] = await Promise.all([
        loadCloudAppState(userId),
        listCloudWardrobeItems(userId),
        loadCloudProfile(userId),
      ]);
      if (cancelled) return;

      const remoteIds = new Set(remoteWardrobe.map((item: any) => item.id));
      const localOnlyItems = localState.wardrobe.filter(
        (item) => !remoteIds.has(item.id),
      );
      const uploadedLocalItems = await Promise.all(
        localOnlyItems.map(async (item) => {
          const created = await createCloudWardrobeItem(item, userId);
          return { ...item, _cloudId: created._cloudId || created.id };
        }),
      );
      if (cancelled) return;

      const cloudSettings = cloudApp.settings || null;
      const profile = cloudProfile || {};
      const remoteProfileDetails =
        profile.profile_details && typeof profile.profile_details === 'object'
          ? normalizeProfileDetails(profile.profile_details)
          : localState.profile.profileDetails;
      const mergedState = {
        ...localState,
        wardrobe: [...remoteWardrobe, ...uploadedLocalItems],
        brief:
          typeof cloudSettings?.brief === 'string'
            ? cloudSettings.brief
            : localState.brief,
        selected:
          typeof cloudSettings?.selected === 'string'
            ? cloudSettings.selected
            : localState.selected,
        wearHistory: mergeById(
          localState.wearHistory,
          cloudApp.wearHistory || [],
        ),
        dayPlan: cloudSettings?.dayPlan ?? localState.dayPlan ?? null,
        settings: {
          ...localState.settings,
          ...(cloudSettings?.settings || {}),
          recommendationCount:
            cloudSettings?.options === 2 || cloudSettings?.options === 3
              ? cloudSettings.options
              : localState.settings.recommendationCount,
        },
        profile: {
          ...localState.profile,
          displayName:
            typeof profile.display_name === 'string'
              ? profile.display_name
              : localState.profile.displayName,
          profileDetails: remoteProfileDetails,
          shareProfileWithAi:
            typeof cloudSettings?.settings?.shareProfileWithAi === 'boolean'
              ? cloudSettings.settings.shareProfileWithAi
              : localState.profile.shareProfileWithAi,
        },
        localOwnerId: userId,
      };

      setState(mergedState);
      setReadyUserId(userId);
      setStatus('synced');
    })().catch((syncError) => {
      if (cancelled) return;
      setStatus('error');
      setError(
        syncError instanceof Error
          ? syncError.message
          : 'Wearwell could not load your cloud data.',
      );
    });

    return () => {
      cancelled = true;
    };
  }, [
    authLoading,
    cloudEnabled,
    isHydrated,
    retryNumber,
    session?.user.id,
    setState,
  ]);

  useEffect(() => {
    const user = session?.user;
    const userId = user?.id;
    if (!user || !userId || !isHydrated || readyUserId !== userId) return;

    let cancelled = false;
    const timeout = setTimeout(async () => {
      setStatus('saving');
      setError('');
      try {
        const current = stateRef.current;
        const dayBrief = extractDayBrief(current.brief, '');
        await saveCloudAppState(userId, {
          plan: dayBrief.occasion || '',
          brief: current.brief,
          options: current.settings.recommendationCount,
          selected: current.selected,
          dayBrief,
          dayPlan: current.dayPlan || null,
          settings: {
            ...current.settings,
            shareProfileWithAi: current.profile.shareProfileWithAi === true,
          },
          wearHistory: current.wearHistory,
        });
        // @ts-ignore The shared JavaScript helper accepts normalized profile details.
        await saveCloudProfile(
          user,
          current.settings.recommendationCount,
          current.profile.displayName,
          {
            weatherPermission: current.settings.location ? 'granted' : 'not_asked',
            weatherLocation: current.settings.location || {},
          },
          current.profile.profileDetails as any,
        );

        const syncedItems = await Promise.all(
          current.wardrobe.map(async (item) => {
            const saved = item._cloudId
              ? await updateCloudWardrobeItem(item, userId)
              : await createCloudWardrobeItem(item, userId);
            return { id: item.id, cloudId: saved._cloudId || saved.id };
          }),
        );
        if (cancelled) return;

        if (syncedItems.some(({ id, cloudId }) => {
          const item = current.wardrobe.find((entry) => entry.id === id);
          return item && item._cloudId !== cloudId;
        })) {
          setState((latest: any) => ({
            ...latest,
            wardrobe: latest.wardrobe.map((item: any) => {
              const saved = syncedItems.find((entry) => entry.id === item.id);
              return saved ? { ...item, _cloudId: saved.cloudId } : item;
            }),
          }));
        }
        setStatus('synced');
      } catch (syncError) {
        if (cancelled) return;
        setStatus('error');
        setError(
          syncError instanceof Error
            ? syncError.message
            : 'Wearwell could not save your cloud changes.',
        );
      }
    }, 700);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [
    isHydrated,
    readyUserId,
    session?.user.id,
    state,
    setState,
  ]);

  return { status, error, retry, removeCloudWardrobeItem };
}