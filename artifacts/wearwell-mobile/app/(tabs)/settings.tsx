import React, { useState } from 'react';
import { Linking, Platform, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';
import { useWearwell } from '@/context/WearwellContext';
import {
  ActionButton,
  BrandHeader,
  Card,
  ChoiceChip,
  InlineNotice,
  PageTitle,
  ScreenScroll,
  SectionTitle,
} from '@/components/WearwellUI';

export default function SettingsScreen() {
  const colors = useColors();
  const router = useRouter();
  const { session, cloudEnabled } = useAuth();
  const {
    state,
    storageError,
    cloudSyncStatus,
    cloudSyncError,
    weatherError,
    weatherLoading,
    permissionNeedsSettings,
    setTemperatureUnit,
    setRecommendationCount,
    setAiEnabled,
    setSpeechEnabled,
    setVoiceLanguage,
    retryCloudSync,
    enableWeather,
    refreshWeather,
    disableWeather,
    clearAllData,
  } = useWearwell();
  const [confirmClear, setConfirmClear] = useState(false);
  const [openingSettings, setOpeningSettings] = useState(false);

  async function setUpWeather() {
    if (state.settings.location) {
      await refreshWeather();
    } else {
      await enableWeather();
    }
  }

  async function openDeviceSettings() {
    setOpeningSettings(true);
    try {
      await Linking.openSettings();
    } catch {
      // Keep the permission instructions visible when deep linking is unavailable.
    } finally {
      setOpeningSettings(false);
    }
  }

  const displayTemp =
    state.weather &&
    Math.round(
      state.settings.temperatureUnit === 'F'
        ? (state.weather.tempC * 9) / 5 + 32
        : state.weather.tempC,
    );

  return (
    <ScreenScroll>
      <BrandHeader caption="YOUR PREFERENCES" />
      <PageTitle
        title="Settings"
        subtitle="Manage your account, styling profile, AI, speech, weather, and saved data."
      />

      <Card style={{ gap: 12 }}>
        <SectionTitle
          title="Account and cloud sync"
          detail={
            !cloudEnabled
              ? 'Account sync is not configured in this app build.'
              : session
                ? `${session.user.email || 'Signed in'} · ${cloudSyncStatus}`
                : 'Sign in with the same account used on the web to sync your wardrobe and saved looks.'
          }
        />
        {cloudSyncError ? <InlineNotice tone="error">{cloudSyncError}</InlineNotice> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <ActionButton
            compact
            label={session ? 'Manage account' : 'Sign in or create account'}
            icon={session ? 'user' : 'log-in'}
            variant="outline"
            onPress={() => router.push('/account')}
          />
          {cloudSyncStatus === 'error' ? (
            <ActionButton
              compact
              label="Retry sync"
              icon="refresh-cw"
              variant="quiet"
              onPress={retryCloudSync}
            />
          ) : null}
        </View>
      </Card>

      <Card style={{ gap: 12 }}>
        <SectionTitle
          title="Personal styling profile"
          detail={state.profile.displayName || 'Optional details to personalize your experience.'}
        />
        <ActionButton
          compact
          variant="outline"
          label="Edit profile and privacy"
          icon="user"
          onPress={() => router.push('/profile')}
        />
      </Card>

      <Card style={{ gap: 13 }}>
        <SectionTitle title="Temperature" detail="Choose how temperatures are displayed." />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <ChoiceChip
            label="Celsius · °C"
            selected={state.settings.temperatureUnit === 'C'}
            onPress={() => setTemperatureUnit('C')}
          />
          <ChoiceChip
            label="Fahrenheit · °F"
            selected={state.settings.temperatureUnit === 'F'}
            onPress={() => setTemperatureUnit('F')}
          />
        </View>
      </Card>

      <Card style={{ gap: 13 }}>
        <SectionTitle
          title="Recommendation options"
          detail="Choose how many outfit ideas to see at a time."
        />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <ChoiceChip
            label="2 looks"
            selected={state.settings.recommendationCount === 2}
            onPress={() => setRecommendationCount(2)}
          />
          <ChoiceChip
            label="3 looks"
            selected={state.settings.recommendationCount === 3}
            onPress={() => setRecommendationCount(3)}
          />
        </View>
      </Card>

      <Card style={{ gap: 13 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View
            style={{
              width: 39,
              height: 39,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 13,
              backgroundColor: colors.sage,
            }}
          >
            <Feather name="map-pin" size={17} color={colors.plum} />
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 14 }}>
              Local weather
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>
              {state.weather && displayTemp !== null
                ? `${displayTemp}°${state.settings.temperatureUnit} · ${state.weather.condition}`
                : state.settings.location
                  ? 'Location saved · no current forecast'
                  : 'Off'}
            </Text>
          </View>
          <ActionButton
            compact
            variant="outline"
            label={weatherLoading ? 'Loading' : state.settings.location ? 'Refresh' : 'Enable'}
            icon={state.settings.location ? 'refresh-cw' : 'map-pin'}
            disabled={weatherLoading}
            onPress={() => void setUpWeather()}
          />
        </View>
        <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18 }}>
          Location is requested only when you enable weather. Wearwell asks for foreground access, uses approximate coordinates rounded to about 1 km, and does not track you in the background.
        </Text>
        {weatherError ? <InlineNotice tone="error">{weatherError}</InlineNotice> : null}
        {permissionNeedsSettings && Platform.OS !== 'web' ? (
          <ActionButton
            compact
            variant="quiet"
            label={openingSettings ? 'Opening settings…' : 'Open device settings'}
            icon="settings"
            disabled={openingSettings}
            onPress={() => void openDeviceSettings()}
          />
        ) : null}
        {state.settings.location ? (
          <ActionButton
            compact
            variant="quiet"
            label="Turn weather off and remove saved location"
            icon="x"
            onPress={disableWeather}
          />
        ) : null}
      </Card>

      <Card style={{ gap: 13 }}>
        <SectionTitle
          title="AI and speech"
          detail="AI assistance is optional. Outfit combinations remain deterministic and come only from your saved wardrobe."
        />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <ChoiceChip
            label={state.settings.aiEnabled ? 'AI assistance on' : 'AI assistance off'}
            selected={state.settings.aiEnabled}
            onPress={() => setAiEnabled(!state.settings.aiEnabled)}
          />
          <ChoiceChip
            label={state.settings.speechEnabled ? 'Read answers aloud' : 'Speech off'}
            selected={state.settings.speechEnabled}
            onPress={() => setSpeechEnabled(!state.settings.speechEnabled)}
          />
        </View>
        <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18 }}>
          Speech reads Wearwell’s assistant responses aloud. Wearwell does not request microphone access; use your keyboard’s voice input if you want to dictate.
        </Text>
        <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>
          Speech language
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {[
            ['en-GB', 'English · UK'],
            ['en-US', 'English · US'],
            ['fr-FR', 'French'],
            ['pt-PT', 'Portuguese'],
            ['es-ES', 'Spanish'],
          ].map(([value, label]) => (
            <ChoiceChip
              key={value}
              label={label}
              selected={state.settings.voiceLanguage === value}
              onPress={() => setVoiceLanguage(value)}
            />
          ))}
        </View>
      </Card>

      <Card style={{ gap: 12 }}>
        <SectionTitle title="Privacy and saved data" />
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
          <Feather name="smartphone" size={15} color={colors.secondaryForeground} style={{ marginTop: 2 }} />
          <Text style={{ flex: 1, color: colors.mutedForeground, fontSize: 12, lineHeight: 18 }}>
            Your data stays on this device unless you sign in. When signed in, your wardrobe, saved looks, feedback, profile, and preferences sync with Wearwell on the web.
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
          <Feather name="image" size={15} color={colors.secondaryForeground} style={{ marginTop: 2 }} />
          <Text style={{ flex: 1, color: colors.mutedForeground, fontSize: 12, lineHeight: 18 }}>
            Photos are used only when you explicitly ask for item suggestions. The photo is temporary; only fields you review and save are kept.
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
          <Feather name="mic-off" size={15} color={colors.secondaryForeground} style={{ marginTop: 2 }} />
          <Text style={{ flex: 1, color: colors.mutedForeground, fontSize: 12, lineHeight: 18 }}>
            Speech is opt-in and plays on your device. The app does not request microphone, contacts, notifications, or background-location access.
          </Text>
        </View>
      </Card>

      <Card style={{ gap: 12 }}>
        <SectionTitle title="Your local data" detail="Remove the wardrobe, history, weather location, and preferences saved by Wearwell on this device." />
        {storageError ? <InlineNotice tone="error">{storageError}</InlineNotice> : null}
        {confirmClear ? (
          <View style={{ gap: 10 }}>
            <InlineNotice tone="error">
              This permanently clears Wearwell data stored on this device. It cannot be undone.
            </InlineNotice>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <ActionButton
                style={{ flex: 1 }}
                variant="danger"
                label="Clear all local data"
                icon="trash-2"
                onPress={() => {
                  void clearAllData();
                  setConfirmClear(false);
                }}
              />
              <ActionButton
                variant="outline"
                label="Cancel"
                onPress={() => setConfirmClear(false)}
              />
            </View>
          </View>
        ) : (
          <ActionButton
            variant="outline"
            label="Clear all local data"
            icon="trash-2"
            onPress={() => setConfirmClear(true)}
          />
        )}
      </Card>
      <Text style={{ color: colors.mutedForeground, textAlign: 'center', fontSize: 10 }}>
        Wearwell Mobile · local-first
      </Text>
    </ScreenScroll>
  );
}