import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  extractDayBrief,
  scoreOutfitCandidates,
  swapOptionsFor,
} from '@/lib/coreBridge';
// @ts-ignore Shared plan helpers are plain JavaScript modules.
import { eventStateFor, normalizeDayPlan } from '../../../../src/dayPlan.mjs';
import { useColors } from '@/hooks/useColors';
import { useWearwell } from '@/context/WearwellContext';
import { AIPlanningCard } from '@/components/AIPlanningCard';
import { AssistantChat } from '@/components/AssistantChat';
import { VoiceDictationButton } from '@/components/VoiceDictationButton';
import {
  ActionButton,
  BrandHeader,
  Card,
  ChoiceChip,
  Eyebrow,
  InlineNotice,
  PageTitle,
  ScreenScroll,
  SectionTitle,
} from '@/components/WearwellUI';

const QUICK_BRIEFS = [
  'I have a relaxed day with a little walking.',
  'I need a comfortable outfit for a long day on my feet.',
  'I have a smart-casual event today.',
  'I want something breathable for warm weather.',
];

const REGENERATION_OPTIONS = [
  { label: 'More comfortable', value: 'more_comfort' },
  { label: 'More casual', value: 'more_casual' },
  { label: 'More formal', value: 'more_formal' },
  { label: 'More colour', value: 'more_color' },
  { label: 'Less attention', value: 'less_attention' },
  { label: 'Different shoes', value: 'different_shoes' },
  { label: 'Different pieces', value: 'different_items' },
];

const DAY_FIELDS = [
  { key: 'occasion', label: 'Occasion', maxLength: 120 },
  { key: 'timeWindow', label: 'Time window', maxLength: 80 },
  { key: 'duration', label: 'Duration', maxLength: 80 },
  { key: 'movement', label: 'Movement', maxLength: 160 },
  { key: 'dressCode', label: 'Dress code', maxLength: 100 },
  { key: 'mood', label: 'Mood / feel', maxLength: 120 },
  { key: 'comfortNeeds', label: 'Comfort', maxLength: 160 },
  { key: 'coverageNeeds', label: 'Coverage', maxLength: 120 },
] as const;

function localDateLabel() {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lusaka',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());
}

function temperatureForDisplay(tempC: number, unit: 'C' | 'F') {
  return Math.round(unit === 'F' ? (tempC * 9) / 5 + 32 : tempC);
}

function WeatherPanel() {
  const colors = useColors();
  const {
    state,
    weatherError,
    weatherLoading,
    permissionNeedsSettings,
    enableWeather,
    refreshWeather,
  } = useWearwell();
  const [openingSettings, setOpeningSettings] = useState(false);
  const temperature = state.weather
    ? temperatureForDisplay(state.weather.tempC, state.settings.temperatureUnit)
    : null;

  async function requestForecast() {
    if (state.settings.location) {
      await refreshWeather();
    } else {
      await enableWeather();
    }
  }

  async function openDeviceSettings() {
    setOpeningSettings(true);
    try {
      const { Linking } = await import('react-native');
      await Linking.openSettings();
    } catch {
      // The inline note remains available if the operating system cannot open Settings.
    } finally {
      setOpeningSettings(false);
    }
  }

  return (
    <Card
      style={{
        padding: 17,
        backgroundColor: colors.sage,
        borderColor: colors.sage,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}>
        <View
          style={{
            width: 44,
            height: 44,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 15,
            backgroundColor: colors.card,
          }}
        >
          <Feather
            name={state.weather?.condition.toLowerCase().includes('rain') ? 'cloud-rain' : 'sun'}
            size={22}
            color={colors.plum}
          />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text
            style={{
              color: colors.secondaryForeground,
              fontFamily: 'Inter_600SemiBold',
              fontSize: 10,
              letterSpacing: 1.1,
            }}
          >
            LOCAL WEATHER
          </Text>
          {state.weather && temperature !== null ? (
            <Text
              accessibilityLabel={`${temperature} degrees ${state.settings.temperatureUnit}, ${state.weather.condition}`}
              style={{
                color: colors.foreground,
                fontFamily: 'Georgia',
                fontSize: 25,
                lineHeight: 29,
              }}
            >
              {temperature}°{state.settings.temperatureUnit}
              <Text
                style={{
                  color: colors.mutedForeground,
                  fontFamily: 'Inter_500Medium',
                  fontSize: 12,
                }}
              >
                {'  '}{state.weather.condition}
              </Text>
            </Text>
          ) : (
            <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 14 }}>
              No forecast yet
            </Text>
          )}
          <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>
            {state.weather?.rainProbability !== null && state.weather?.rainProbability !== undefined
              ? `Rain chance ${Math.round(state.weather.rainProbability)}%`
              : 'Optional · only while you use the app'}
            {state.weather?.windKph !== null && state.weather?.windKph !== undefined
              ? `  ·  Wind ${Math.round(state.weather.windKph)} km/h`
              : ''}
          </Text>
        </View>
        {weatherLoading ? (
          <ActivityIndicator color={colors.plum} />
        ) : (
          <ActionButton
            compact
            variant="outline"
            label={state.settings.location ? 'Refresh' : 'Enable'}
            icon={state.settings.location ? 'refresh-cw' : 'map-pin'}
            onPress={() => void requestForecast()}
            accessibilityLabel={state.settings.location ? 'Refresh local weather' : 'Enable optional local weather'}
          />
        )}
      </View>
      {weatherError ? (
        <View style={{ gap: 8, marginTop: 12 }}>
          <InlineNotice tone="error">{weatherError}</InlineNotice>
          {permissionNeedsSettings ? (
            <ActionButton
              compact
              variant="quiet"
              label={openingSettings ? 'Opening settings…' : 'Open device settings'}
              icon="settings"
              disabled={openingSettings}
              onPress={() => void openDeviceSettings()}
            />
          ) : null}
        </View>
      ) : state.weather ? (
        <Text style={{ marginTop: 9, color: colors.mutedForeground, fontSize: 10 }}>
          Updated {new Date(state.weather.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · Near you
        </Text>
      ) : null}
    </Card>
  );
}

function OutfitCard({
  outfit,
  selectedId,
  dayBrief,
  candidates,
}: {
  outfit: any;
  selectedId: string | null;
  dayBrief: any;
  candidates: any[];
}) {
  const colors = useColors();
  const { state, saveLook } = useWearwell();
  const [currentOutfit, setCurrentOutfit] = useState(outfit);
  const [showSwaps, setShowSwaps] = useState(false);
  const itemById = useMemo(
    () => Object.fromEntries(state.wardrobe.map((item) => [item.id, item])),
    [state.wardrobe],
  );
  const swaps = useMemo(
    () => swapOptionsFor(currentOutfit, candidates).slice(0, 6),
    [currentOutfit, candidates],
  );
  const isSaved = selectedId === currentOutfit.id;

  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <View
        style={{
          paddingHorizontal: 16,
          paddingTop: 15,
          paddingBottom: 13,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <View style={{ gap: 4 }}>
          <Text
            style={{
              color: colors.mutedForeground,
              fontFamily: 'Inter_600SemiBold',
              fontSize: 10,
              letterSpacing: 1,
            }}
          >
            {currentOutfit.name.toUpperCase()}
          </Text>
          <Text style={{ color: colors.foreground, fontFamily: 'Georgia', fontSize: 20 }}>
            {currentOutfit.level}
          </Text>
        </View>
        {isSaved ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              paddingHorizontal: 9,
              paddingVertical: 6,
              borderRadius: 20,
              backgroundColor: colors.sage,
            }}
          >
            <Feather name="check" size={12} color={colors.secondaryForeground} />
            <Text style={{ color: colors.secondaryForeground, fontSize: 10, fontFamily: 'Inter_600SemiBold' }}>
              SAVED
            </Text>
          </View>
        ) : null}
      </View>
      <View
        style={{
          marginHorizontal: 15,
          padding: 13,
          borderRadius: 12,
          backgroundColor: colors.background,
          gap: 10,
        }}
      >
        {currentOutfit.itemIds.map((id: string) => {
          const item = itemById[id];
          if (!item) return null;
          return (
            <View key={id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 4,
                  backgroundColor: item.color,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              />
              <Text style={{ flex: 1, color: colors.foreground, fontSize: 13 }}>
                {item.name}
              </Text>
              <Text
                style={{
                  color: colors.mutedForeground,
                  fontFamily: 'Inter_500Medium',
                  fontSize: 10,
                }}
              >
                {item.type}
              </Text>
            </View>
          );
        })}
      </View>
      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 15, gap: 11 }}>
        <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18 }}>
          {currentOutfit.reason}
        </Text>
        <Text style={{ color: colors.mutedForeground, fontSize: 10, lineHeight: 15 }}>
          {currentOutfit.weather}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <ActionButton
            style={{ flex: 1 }}
            label={isSaved ? 'Saved to your history' : 'Save this look'}
            icon={isSaved ? 'check' : 'bookmark'}
            variant={isSaved ? 'secondary' : 'primary'}
            onPress={() => saveLook(currentOutfit, dayBrief)}
          />
          {swaps.length ? (
            <ActionButton
              compact
              variant="outline"
              label="Swap"
              icon="shuffle"
              onPress={() => setShowSwaps((current) => !current)}
            />
          ) : null}
        </View>
        {showSwaps ? (
          <View
            style={{
              gap: 8,
              padding: 12,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 12,
              backgroundColor: colors.card,
            }}
          >
            <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>
              Replace one piece
            </Text>
            {swaps.map(({ candidate, removedId, addedId }) => (
              <ActionButton
                key={candidate.id}
                compact
                variant="outline"
                label={`${itemById[removedId]?.name || 'Piece'} → ${itemById[addedId]?.name || 'another item'}`}
                onPress={() => {
                  setCurrentOutfit(candidate);
                  setShowSwaps(false);
                }}
              />
            ))}
          </View>
        ) : null}
      </View>
    </Card>
  );
}

export default function TodayScreen() {
  const colors = useColors();
  const router = useRouter();
  const {
    state,
    isHydrated,
    setBrief,
    setActiveDayEvent,
    updateDayEvent,
  } = useWearwell();
  const [regeneration, setRegeneration] = useState<{
    sourceKey: string;
    reason: string;
    excludedItemSets: string[];
  }>({ sourceKey: '', reason: '', excludedItemSets: [] });
  const [eventDetailsOpen, setEventDetailsOpen] = useState(false);
  const [briefInputHeight, setBriefInputHeight] = useState(104);
  const [briefProcessRequest, setBriefProcessRequest] = useState<{
    id: number;
    brief?: string;
  }>({ id: 0 });
  const dayPlan = useMemo(
    () => normalizeDayPlan(state.dayPlan, { fallbackBrief: state.brief }),
    [state.dayPlan, state.brief],
  );
  const activeEvent = eventStateFor(dayPlan, dayPlan.activeEventId);
  const dayBrief = activeEvent?.dayBrief || extractDayBrief(state.brief, '');
  const sourceKey = JSON.stringify({
    eventId: activeEvent?.id,
    dayBrief,
    wardrobe: state.wardrobe.map((item) => [item.id, item.available !== false]),
    weather: state.weather
      ? [state.weather.tempC, state.weather.rainProbability, state.weather.windKph]
      : null,
    feedback: state.wearHistory.map((entry) => [entry.id, entry.feedback]),
  });
  const activeRegeneration =
    regeneration.sourceKey === sourceKey
      ? regeneration
      : { sourceKey, reason: '', excludedItemSets: [] };
  const ranking = useMemo(
    () =>
      scoreOutfitCandidates(state.wardrobe, {
        dayBrief,
        weather: state.weather ? { tempC: state.weather.tempC } : {},
        wearHistory: state.wearHistory,
        regenerationReason: activeRegeneration.reason,
        excludedItemSets: activeRegeneration.excludedItemSets,
      }),
    [
      state.wardrobe,
      state.weather,
      state.wearHistory,
      dayBrief,
      activeRegeneration.reason,
      activeRegeneration.excludedItemSets,
    ],
  );
  const recommendations = ranking.candidates.slice(
    0,
    state.settings.recommendationCount,
  );

  function showAnotherSet(reason: string) {
    const currentItemSets = recommendations.map((candidate: any) =>
      candidate.itemIds.slice().sort().join('\u001f'),
    );
    setRegeneration({
      sourceKey,
      reason,
      excludedItemSets: [
        ...new Set([
          ...activeRegeneration.excludedItemSets,
          ...currentItemSets,
        ]),
      ].slice(-80),
    });
  }

  function updateActiveEventField(key: string, value: string) {
    if (!activeEvent) return;
    const nextDayBrief = { ...activeEvent.dayBrief, [key]: value };
    updateDayEvent(activeEvent.id, {
      dayBrief: nextDayBrief,
      excludedItemSets: [],
      regenerationReason: '',
      ...(key === 'occasion'
        ? { label: value || 'Your next wear', description: value || 'Your next wear' }
        : {}),
      ...(key === 'timeWindow' ? { timeWindow: value } : {}),
    });
  }

  if (!isHydrated) {
    return (
      <ScreenScroll>
        <BrandHeader />
        <View style={{ flex: 1, minHeight: 300, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <ActivityIndicator color={colors.plum} size="large" />
          <Text style={{ color: colors.mutedForeground }}>Loading your wardrobe…</Text>
        </View>
      </ScreenScroll>
    );
  }

  return (
    <ScreenScroll>
      <BrandHeader />
      <View style={{ gap: 8, marginTop: 4 }}>
        <Eyebrow>{localDateLabel()}</Eyebrow>
        <PageTitle
          title="What does today ask of you?"
          subtitle="Build an outfit around your real plans, comfort, and clothes."
        />
      </View>

      <Card style={{ gap: 14, padding: 16 }}>
        <SectionTitle
          title="Your day"
          detail="Separate plans with a new line or semicolon to create an event for each. Unstated needs stay unknown."
        />
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
          <TextInput
            accessibilityLabel="Describe your plans, comfort needs, and dress code"
            value={state.brief}
            onChangeText={setBrief}
            placeholder="A long day at work, then a walk. I want to stay comfortable…"
            placeholderTextColor={colors.mutedForeground}
            multiline
            maxLength={1200}
            textAlignVertical="top"
            scrollEnabled={false}
            onContentSizeChange={(event) =>
              setBriefInputHeight(Math.max(104, event.nativeEvent.contentSize.height))
            }
            style={{
              flex: 1,
              minHeight: 104,
              height: briefInputHeight,
              padding: 13,
              borderWidth: 1,
              borderColor: colors.input,
              borderRadius: 12,
              color: colors.foreground,
              backgroundColor: colors.background,
              fontFamily: 'Georgia',
              fontSize: 16,
              lineHeight: 23,
            }}
          />
          <View style={{ alignItems: 'center', gap: 4 }}>
            <Pressable
              testID="clear-day-brief"
              accessibilityRole="button"
              accessibilityLabel="Clear day brief"
              accessibilityHint="Remove all text from your day brief"
              disabled={!state.brief.trim()}
              onPress={() => setBrief('')}
              style={({ pressed }) => ({
                width: 46,
                height: 38,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: !state.brief.trim() ? 0.4 : pressed ? 0.65 : 1,
              })}
            >
              <Feather
                name="trash-2"
                size={17}
                color={state.brief.trim() ? colors.mutedForeground : colors.border}
              />
            </Pressable>
            <Pressable
              testID="process-day-brief"
              accessibilityRole="button"
              accessibilityLabel="Process my brief"
              accessibilityHint="Start the assistant interview using the text in your day brief"
              disabled={!state.brief.trim()}
              onPress={() =>
                setBriefProcessRequest((current) => ({ id: current.id + 1 }))
              }
              style={({ pressed }) => ({
                width: 46,
                height: 46,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: state.brief.trim() ? colors.primary : colors.border,
                borderRadius: 12,
                backgroundColor: state.brief.trim() ? colors.primary : colors.card,
                opacity: !state.brief.trim() ? 0.5 : pressed ? 0.82 : 1,
              })}
            >
              <Feather
                name="corner-down-left"
                size={18}
                color={state.brief.trim() ? colors.primaryForeground : colors.mutedForeground}
              />
            </Pressable>
          </View>
        </View>
        <VoiceDictationButton
          language={state.settings.voiceLanguage}
          onStart={() => setBrief('')}
          onTranscript={(transcript) => {
            const nextBrief = transcript.trim().slice(0, 1200);
            setBrief(nextBrief);
            setBriefProcessRequest((current) => ({
              id: current.id + 1,
              brief: nextBrief,
            }));
          }}
        />
        <AssistantChat
          hasRecommendations={recommendations.length > 0}
          processRequest={briefProcessRequest}
          showWardrobeGap={
            recommendations.length === 0 &&
            activeRegeneration.excludedItemSets.length === 0
          }
          onReviewBrief={() => setEventDetailsOpen(true)}
        />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
          {QUICK_BRIEFS.map((brief) => (
            <ChoiceChip
              key={brief}
              label={brief.length > 36 ? `${brief.slice(0, 33)}…` : brief}
              selected={state.brief === brief}
              onPress={() => setBrief(state.brief === brief ? '' : brief)}
              accessibilityLabel={`Use prompt: ${brief}`}
            />
          ))}
        </View>
        <View style={{ gap: 8 }}>
          <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>
            {dayPlan.events.length > 1
              ? `${dayPlan.events.length} events · choose one to see its recommendations`
              : 'Active event'}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
            {dayPlan.events.map((event: any) => (
              <ChoiceChip
                key={event.id}
                label={
                  event.timeWindow
                    ? `${event.label} · ${event.timeWindow}`
                    : event.label
                }
                selected={event.id === activeEvent?.id}
                onPress={() => setActiveDayEvent(event.id)}
                accessibilityLabel={`Plan event: ${event.label}${event.timeWindow ? `, ${event.timeWindow}` : ''}`}
              />
            ))}
          </View>
        </View>
      </Card>

      {activeEvent ? (
        <Card style={{ gap: 11, padding: 16 }}>
          <SectionTitle
            title={`Details for ${activeEvent.label || 'this event'}`}
            detail="Context used to score looks and guide the assistant."
          />
          <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18 }}>
            {[activeEvent.dayBrief?.timeWindow, activeEvent.dayBrief?.dressCode, activeEvent.dayBrief?.comfortNeeds]
              .filter(Boolean)
              .join(' · ') || 'Add timing, dress code, or comfort needs if useful.'}
          </Text>
          <ActionButton
            compact
            variant="outline"
            label={eventDetailsOpen ? 'Hide event details' : 'Edit event details'}
            icon={eventDetailsOpen ? 'chevron-up' : 'edit-2'}
            onPress={() => setEventDetailsOpen((current) => !current)}
          />
          {eventDetailsOpen
            ? DAY_FIELDS.map((field) => (
                <View key={field.key} style={{ gap: 5 }}>
                  <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold', fontSize: 11 }}>
                    {field.label}
                  </Text>
                  <TextInput
                    accessibilityLabel={`${field.label} for ${activeEvent.label || 'this event'}`}
                    value={activeEvent.dayBrief?.[field.key] || ''}
                    onChangeText={(value) => updateActiveEventField(field.key, value)}
                    placeholder={`Add ${field.label.toLowerCase()} (optional)`}
                    placeholderTextColor={colors.mutedForeground}
                    maxLength={field.maxLength}
                    style={{
                      minHeight: 42,
                      paddingHorizontal: 11,
                      paddingVertical: 8,
                      borderWidth: 1,
                      borderColor: colors.input,
                      borderRadius: 10,
                      color: colors.foreground,
                      backgroundColor: colors.background,
                      fontSize: 13,
                    }}
                  />
                </View>
              ))
            : null}
        </Card>
      ) : null}

      <WeatherPanel />

      {state.wardrobe.length === 0 ? (
        <Card style={{ gap: 13, padding: 19 }}>
          <View
            style={{
              width: 45,
              height: 45,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 15,
              backgroundColor: colors.warm,
            }}
          >
            <Feather name="grid" size={20} color={colors.plum} />
          </View>
          <PageTitle title="Start with your wardrobe" subtitle="Add a top and bottom, or a one-piece outfit. Wearwell only recommends clothes you record." />
          <ActionButton
            label="Add your first item"
            icon="plus"
            onPress={() => router.navigate('/(tabs)/wardrobe')}
          />
        </Card>
      ) : (
        <>
          <View style={{ gap: 6 }}>
            <SectionTitle
              title="Outfits from your wardrobe"
              detail={
                ranking.candidates.length
                  ? `${ranking.candidates.length} combinations scored from your recorded clothes.`
                  : 'Add a top and bottom, or one-piece clothing, to create a complete outfit.'
              }
            />
            <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>
              Recommendations never add pieces you have not saved.
            </Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
            {REGENERATION_OPTIONS.map((option) => (
              <ChoiceChip
                key={option.value}
                label={option.label}
                selected={activeRegeneration.reason === option.value}
                onPress={() => showAnotherSet(option.value)}
              />
            ))}
            {activeRegeneration.excludedItemSets.length ? (
              <ChoiceChip
                label="Start over"
                selected={false}
                onPress={() =>
                  setRegeneration({
                    sourceKey,
                    reason: '',
                    excludedItemSets: [],
                  })
                }
              />
            ) : null}
          </View>
          {recommendations.length ? (
            recommendations.map((outfit: any) => (
              <OutfitCard
                key={`${sourceKey}-${outfit.id}`}
                outfit={outfit}
                selectedId={activeEvent?.selectedRecommendation || null}
                dayBrief={dayBrief}
                candidates={ranking.candidates}
              />
            ))
          ) : (
            <Card style={{ gap: 10 }}>
              <Text style={{ color: colors.foreground, fontFamily: 'Georgia', fontSize: 20 }}>
                {activeRegeneration.excludedItemSets.length
                  ? 'No more matching looks'
                  : 'Not enough matching pieces yet'}
              </Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 13, lineHeight: 20 }}>
                {activeRegeneration.excludedItemSets.length
                  ? 'Try another preference or start over to see the first recommendations again.'
                  : 'Add a top and bottom, or a dress, jumpsuit, or romper. Shoes and layers are optional.'}
              </Text>
              {activeRegeneration.excludedItemSets.length ? (
                <ActionButton
                  label="Start over"
                  icon="rotate-ccw"
                  variant="outline"
                  onPress={() =>
                    setRegeneration({
                      sourceKey,
                      reason: '',
                      excludedItemSets: [],
                    })
                  }
                />
              ) : null}
            </Card>
          )}
        </>
      )}
      {state.wearHistory.length > 0 ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          <Feather name="activity" size={14} color={colors.mutedForeground} />
          <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>
            Your explicit feedback can influence future rankings for the same item combination.
          </Text>
        </View>
      ) : null}
      <AIPlanningCard
        candidate={ranking.candidates[0] || null}
        onRegenerate={showAnotherSet}
      />
    </ScreenScroll>
  );
}