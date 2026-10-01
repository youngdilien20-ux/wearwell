import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { FeedbackKey, FeedbackValue, useWearwell } from '@/context/WearwellContext';
import {
  ActionButton,
  BrandHeader,
  Card,
  ChoiceChip,
  Eyebrow,
  PageTitle,
  ScreenScroll,
  SectionTitle,
} from '@/components/WearwellUI';

const FEEDBACK = [
  {
    key: 'woreIt' as FeedbackKey,
    label: 'Worn',
    options: [
      { label: 'Wore it', value: 'yes' as FeedbackValue },
        { label: 'Did not wear it', value: 'no' as FeedbackValue },
      { label: 'Not yet', value: 'not-yet' as FeedbackValue },
    ],
  },
  {
    key: 'comfort' as FeedbackKey,
    label: 'Comfort',
    options: [
      { label: 'Good', value: 'good' as FeedbackValue },
      { label: 'Could improve', value: 'could-improve' as FeedbackValue },
    ],
  },
  {
    key: 'likedColors' as FeedbackKey,
    label: 'Colours',
    options: [
      { label: 'Liked', value: 'yes' as FeedbackValue },
      { label: 'Not for me', value: 'no' as FeedbackValue },
    ],
  },
  {
    key: 'wouldWearAgain' as FeedbackKey,
    label: 'Again',
    options: [
      { label: 'Yes', value: 'yes' as FeedbackValue },
      { label: 'No', value: 'no' as FeedbackValue },
    ],
  },
];

function dateLabel(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Saved look';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lusaka',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export default function HistoryScreen() {
  const colors = useColors();
  const { state, updateFeedback, clearHistory } = useWearwell();
  const [confirmClear, setConfirmClear] = useState(false);
  const entries = [...state.wearHistory].reverse();

  return (
    <ScreenScroll>
      <BrandHeader caption="LOOKS YOU SAVED" />
      <PageTitle
        title="Your looks"
        subtitle="Save combinations you want to remember, then leave feedback when you have worn them."
      />

      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: colors.warm, borderColor: colors.warm }}>
        <View
          style={{
            width: 42,
            height: 42,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 14,
            backgroundColor: colors.card,
          }}
        >
          <Feather name="heart" size={19} color={colors.plum} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>
            Your feedback stays specific
          </Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16 }}>
            It only changes rankings for the exact pieces you reviewed.
          </Text>
        </View>
      </Card>

      {entries.length === 0 ? (
        <Card style={{ alignItems: 'center', gap: 11, paddingVertical: 29 }}>
          <View
            style={{
              width: 57,
              height: 57,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 29,
              backgroundColor: colors.background,
            }}
          >
            <Feather name="clock" size={23} color={colors.plum} />
          </View>
          <Text style={{ color: colors.foreground, fontFamily: 'Georgia', fontSize: 23 }}>
            Your saved looks will appear here
          </Text>
          <Text style={{ maxWidth: 300, color: colors.mutedForeground, textAlign: 'center', fontSize: 13, lineHeight: 20 }}>
            Save an outfit from Today when you want to keep it in your history.
          </Text>
        </Card>
      ) : (
        <View style={{ gap: 11 }}>
          <View style={{ gap: 10 }}>
            <SectionTitle
              title="Saved history"
              detail={`${entries.length} ${entries.length === 1 ? 'look' : 'looks'} on this device`}
            />
            {confirmClear ? (
              <Card style={{ gap: 10 }}>
                <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>
                  Clear saved history?
                </Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18 }}>
                  This removes saved looks and their feedback from this device. Your wardrobe and settings will stay.
                </Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <ActionButton
                    style={{ flex: 1 }}
                    variant="danger"
                    label="Clear history"
                    icon="trash-2"
                    onPress={() => {
                      clearHistory();
                      setConfirmClear(false);
                    }}
                  />
                  <ActionButton
                    variant="outline"
                    label="Cancel"
                    onPress={() => setConfirmClear(false)}
                  />
                </View>
              </Card>
            ) : (
              <ActionButton
                compact
                variant="outline"
                label="Clear history"
                icon="trash-2"
                onPress={() => setConfirmClear(true)}
              />
            )}
          </View>
          {entries.map((entry) => (
            <Card key={entry.id} style={{ gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 11 }}>
                <View
                  style={{
                    width: 38,
                    height: 38,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 13,
                    backgroundColor: colors.sage,
                  }}
                >
                  <Feather name="bookmark" size={16} color={colors.plum} />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Eyebrow>{dateLabel(entry.createdAt)}</Eyebrow>
                  <Text style={{ color: colors.foreground, fontFamily: 'Georgia', fontSize: 20 }}>
                    {entry.outfitName}
                  </Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18 }}>
                    {entry.itemNames.join(' · ')}
                  </Text>
                </View>
              </View>
              {entry.reason ? (
                <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16 }}>
                  {entry.reason}
                </Text>
              ) : null}
              {FEEDBACK.map((group) => (
                <View
                  key={group.key}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 7,
                  }}
                >
                  <Text style={{ width: 55, color: colors.mutedForeground, fontSize: 10 }}>
                    {group.label}
                  </Text>
                  {group.options.map((option) => (
                    <ChoiceChip
                      key={option.value}
                      label={option.label}
                      selected={entry.feedback[group.key] === option.value}
                      onPress={() =>
                        updateFeedback(
                          entry.id,
                          group.key,
                          entry.feedback[group.key] === option.value ? '' : option.value,
                        )
                      }
                    />
                  ))}
                </View>
              ))}
            </Card>
          ))}
        </View>
      )}
      <Text style={{ color: colors.mutedForeground, fontSize: 10, lineHeight: 15 }}>
        Feedback is optional. Wearwell does not infer comfort, colour preference, or whether you wore a saved look.
      </Text>
    </ScreenScroll>
  );
}