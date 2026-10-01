import React from 'react';
import { Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
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
// @ts-ignore Shared profile options are plain JavaScript data.
import { FIT_PREFERENCE_OPTIONS, SKIN_TONE_OPTIONS } from '../../../src/profile.mjs';

function ProfileField({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
  keyboardType = 'default',
  maxLength = 120,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'numeric';
  maxLength?: number;
}) {
  const colors = useColors();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        multiline={multiline}
        keyboardType={keyboardType}
        maxLength={maxLength}
        textAlignVertical={multiline ? 'top' : 'center'}
        style={{
          minHeight: multiline ? 92 : 46,
          padding: 12,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 12,
          color: colors.foreground,
          backgroundColor: colors.background,
          fontSize: 14,
          lineHeight: 20,
        }}
      />
    </View>
  );
}

export default function ProfileScreen() {
  const colors = useColors();
  const router = useRouter();
  const {
    state,
    setDisplayName,
    setProfileDetails,
    setShareProfileWithAi,
  } = useWearwell();
  const details = state.profile.profileDetails;

  function update(field: string, value: string) {
    setProfileDetails({ ...details, [field]: value });
  }

  return (
    <ScreenScroll>
      <BrandHeader caption="PERSONAL STYLING PROFILE" />
      <PageTitle
        title="Your profile"
        subtitle="Add only the details that help Wearwell tailor suggestions to you. You can change or clear these at any time."
      />

      <Card style={{ gap: 13 }}>
        <SectionTitle title="About you" detail="Your display name is used in your account. Other details are optional." />
        <ProfileField
          label="Display name"
          value={state.profile.displayName}
          onChangeText={setDisplayName}
          maxLength={120}
        />
        <ProfileField label="Country" value={details.country} onChangeText={(value) => update('country', value)} />
        <ProfileField label="Country or region (optional)" value={details.countryOther} onChangeText={(value) => update('countryOther', value)} />
        <ProfileField label="Region or province" value={details.region} onChangeText={(value) => update('region', value)} />
        <ProfileField label="City" value={details.city} onChangeText={(value) => update('city', value)} />
      </Card>

      <Card style={{ gap: 12 }}>
        <SectionTitle title="Fit and appearance" detail="Used only when you choose to share these details with AI." />
        <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>
          Skin tone
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {SKIN_TONE_OPTIONS.map((option: any) => (
            <ChoiceChip
              key={option.value}
              label={option.label}
              selected={details.skinTone === option.value}
              onPress={() => update('skinTone', details.skinTone === option.value ? '' : option.value)}
            />
          ))}
        </View>
        <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>
          Fit preference
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {FIT_PREFERENCE_OPTIONS.map((option: any) => (
            <ChoiceChip
              key={option.value}
              label={option.label}
              selected={details.fitPreference === option.value}
              onPress={() => update('fitPreference', details.fitPreference === option.value ? '' : option.value)}
            />
          ))}
        </View>
        <ProfileField
          label="Height (cm)"
          value={details.heightCm}
          onChangeText={(value) => update('heightCm', value.replace(/\D/g, '').slice(0, 3))}
          keyboardType="numeric"
          maxLength={3}
        />
        <ProfileField
          label="Hair or headwear considerations"
          value={details.hairProfile}
          onChangeText={(value) => update('hairProfile', value)}
          multiline
          maxLength={120}
        />
        <ProfileField
          label="Cultural, faith, or community considerations"
          value={details.communityContext}
          onChangeText={(value) => update('communityContext', value)}
          multiline
          maxLength={500}
        />
      </Card>

      <Card style={{ gap: 12 }}>
        <SectionTitle title="AI sharing" detail="Profile details are not sent to AI unless you turn this on." />
        <InlineNotice>
          When enabled, only normalized, non-empty profile details are included in your assistant request. Your saved wardrobe and photos are not sent with that request.
        </InlineNotice>
        <ChoiceChip
          label={state.profile.shareProfileWithAi ? 'Share profile details with AI' : 'Keep profile details private'}
          selected={state.profile.shareProfileWithAi}
          onPress={() => setShareProfileWithAi(!state.profile.shareProfileWithAi)}
        />
      </Card>

      <ActionButton
        label="Done"
        icon="check"
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/settings'))}
      />
    </ScreenScroll>
  );
}