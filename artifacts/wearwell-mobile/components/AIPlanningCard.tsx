import React, { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Speech from 'expo-speech';
import { useAuth } from '@/context/AuthContext';
import { useWearwell } from '@/context/WearwellContext';
import { useColors } from '@/hooks/useColors';
import { supabase } from '@/lib/supabase';
import {
  ActionButton,
  Card,
  InlineNotice,
  SectionTitle,
} from '@/components/WearwellUI';
// @ts-ignore Shared assistant helpers are plain JavaScript modules.
import {
  buildAssistantRequestPayload,
  classifyAssistantFollowUp,
  parseAssistantResponse,
} from '../../../src/assistantPlanning.mjs';
import { extractDayBrief } from '@/lib/coreBridge';
import { VoiceDictationButton } from '@/components/VoiceDictationButton';
// @ts-ignore Shared plan helpers are plain JavaScript modules.
import { eventStateFor, normalizeDayPlan } from '../../../src/dayPlan.mjs';

const FIELD_LABELS: Record<string, string> = {
  occasion: 'Occasion',
  timeWindow: 'Time',
  duration: 'Duration',
  movement: 'Movement',
  dressCode: 'Dress code',
  mood: 'Style or mood',
  comfortNeeds: 'Comfort',
  coverageNeeds: 'Coverage',
};

export function AIPlanningCard({
  candidate,
  onRegenerate,
}: {
  candidate: any | null;
  onRegenerate?: (reason: string) => void;
}) {
  const colors = useColors();
  const router = useRouter();
  const { session } = useAuth();
  const {
    state,
    setBrief,
    updateDayEvent,
  } = useWearwell();
  const dayPlan = normalizeDayPlan(state.dayPlan, { fallbackBrief: state.brief });
  const activeEvent = eventStateFor(dayPlan, dayPlan.activeEventId);
  const dayBrief = activeEvent?.dayBrief || extractDayBrief(state.brief, '');
  const [assistantResult, setAssistantResult] = useState<any>(null);
  const [interviewOpen, setInterviewOpen] = useState(false);
  const [interviewMessages, setInterviewMessages] = useState<Array<{ role: string; content: string }>>([]);
  const [interviewAnswers, setInterviewAnswers] = useState<Record<string, string>>({});
  const [resolvedFields, setResolvedFields] = useState<string[]>([]);
  const [currentField, setCurrentField] = useState<string | null>(null);
  const [interviewComplete, setInterviewComplete] = useState(false);
  const [reply, setReply] = useState('');
  const [followUpDraft, setFollowUpDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => () => {
    void Speech.stop();
  }, []);

  function speak(text: string) {
    if (!state.settings.speechEnabled || !text.trim()) return;
    try {
      Speech.stop();
      Speech.speak(text, {
        language: state.settings.voiceLanguage || 'en-GB',
        voice: state.settings.speechVoiceId || undefined,
        rate: 0.92,
      });
    } catch {
      setError('Speech is not available on this device.');
    }
  }

  async function explainLook(followUpMessage = '') {
    if (!state.settings.aiEnabled || !session?.user) return;
    if (!supabase) {
      setError('AI planning is not configured in this app build.');
      return;
    }
    if (!candidate) {
      setError('Add enough wardrobe pieces to create a complete look before asking for an explanation.');
      return;
    }

    setBusy(true);
    setError('');
    setAssistantResult(null);
    try {
      const wardrobeById = Object.fromEntries(
        state.wardrobe.map((item) => [item.id, item]),
      );
      const structuredDetails = Object.entries(dayBrief)
        .filter(([, value]) => typeof value === 'string' && value.trim())
        .map(([key, value]) =>
          `${FIELD_LABELS[key] || key}: ${typeof value === 'string' ? value.trim() : ''}`,
        )
        .join('\n');
      const request = buildAssistantRequestPayload({
        brief: [activeEvent?.brief || state.brief, structuredDetails]
          .filter(Boolean)
          .join('\n')
          .slice(0, 1500),
        occasion: dayBrief.occasion || '',
        voiceLanguage: state.settings.voiceLanguage,
        weather: state.weather
          ? {
              tempC: state.weather.tempC,
              rainProbability: state.weather.rainProbability,
              windKph: state.weather.windKph,
              conditionLabel: state.weather.condition,
              source: 'Open-Meteo',
              isFallback: false,
            }
          : null,
        weatherStatus: state.weather ? 'live' : 'unavailable',
        candidate,
        wardrobeById,
        activeEvent,
        dayContext: dayPlan.events,
        followUpMessage,
        profileDetails: state.profile.profileDetails,
        shareProfileWithAi: state.profile.shareProfileWithAi,
      });
      const { data, error: invokeError } = await supabase.functions.invoke(
        'interpret-assistant',
        { body: request },
      );
      if (invokeError) throw invokeError;
      const parsed = parseAssistantResponse(data);
      setAssistantResult(parsed);
      speak(parsed.explanation);
    } catch {
      setError('The assistant could not respond. Your deterministic wardrobe recommendations are still available.');
    } finally {
      setBusy(false);
    }
  }

  async function interview(
    action: 'start' | 'reply',
    overrides?: {
      answers: Record<string, string>;
      resolvedFields: string[];
      currentField: string | null;
      messages: Array<{ role: string; content: string }>;
    },
  ) {
    if (!state.settings.aiEnabled || !session?.user || !supabase) return;
    setBusy(true);
    setError('');
    try {
      const currentReply = action === 'reply' ? reply.trim() : '';
      const answers = overrides?.answers ?? interviewAnswers;
      const fields = overrides?.resolvedFields ?? resolvedFields;
      const field = overrides?.currentField ?? currentField;
      const messages = overrides?.messages ?? interviewMessages;
      const { data, error: invokeError } = await supabase.functions.invoke(
        'brief-interview',
        {
          body: {
            action,
            answers,
            resolvedFields: fields,
            currentField: field,
            latestAnswer: currentReply,
            conversation: messages.slice(-12),
          },
        },
      );
      if (invokeError) throw invokeError;
      if (
        !data ||
        typeof data.assistantMessage !== 'string' ||
        !data.answers ||
        typeof data.answers !== 'object' ||
        !Array.isArray(data.resolvedFields)
      ) {
        throw new Error('The assistant returned an invalid response.');
      }
      const nextAnswers = Object.fromEntries(
        Object.entries(data.answers)
          .filter(([key, value]) => key in FIELD_LABELS && typeof value === 'string')
          .map(([key, value]) => [key, String(value).slice(0, 240)]),
      );
      const nextMessages = [
        ...interviewMessages,
        ...(action === 'reply' && currentReply
          ? [{ role: 'user', content: currentReply.slice(0, 300) }]
          : []),
        { role: 'assistant', content: data.assistantMessage.slice(0, 500) },
      ].slice(-16);
      setInterviewMessages(nextMessages);
      setInterviewAnswers(nextAnswers);
      setResolvedFields(
        data.resolvedFields.filter((field: unknown) => typeof field === 'string'),
      );
      setCurrentField(
        typeof data.currentField === 'string' && data.currentField in FIELD_LABELS
          ? data.currentField
          : null,
      );
      setInterviewComplete(data.isComplete === true);
      setReply('');
      speak(data.assistantMessage);
    } catch {
      setError('The brief interview could not finish. You can keep editing your day directly.');
    } finally {
      setBusy(false);
    }
  }

  function applyInterviewAnswers() {
    const updates = Object.fromEntries(
      Object.entries(interviewAnswers)
        .filter(([key, value]) => key in FIELD_LABELS && typeof value === 'string')
        .map(([key, value]) => [key, value.trim().slice(0, 160)]),
    );
    if (activeEvent && Object.keys(updates).length) {
      const nextDayBrief = { ...activeEvent.dayBrief, ...updates };
      updateDayEvent(activeEvent.id, {
        dayBrief: nextDayBrief,
        excludedItemSets: [],
        regenerationReason: '',
        ...(updates.occasion
          ? { label: updates.occasion, description: updates.occasion }
          : {}),
        ...(updates.timeWindow ? { timeWindow: updates.timeWindow } : {}),
      });
    } else if (Object.keys(updates).length) {
      const details = Object.entries(updates)
        .filter(([, value]) => value)
        .map(([key, value]) => `${FIELD_LABELS[key]}: ${value}`);
      setBrief([state.brief.trim(), ...details].filter(Boolean).join('\n').slice(0, 1200));
    }
    setInterviewOpen(false);
    setInterviewComplete(false);
    setInterviewMessages([]);
    setInterviewAnswers({});
    setResolvedFields([]);
    setCurrentField(null);
  }

  function startInterview() {
    setInterviewOpen(true);
    const seededAnswers = { ...dayBrief, occasion: '' };
    const seededFields = Object.entries(seededAnswers)
      .filter(([key, value]) => key !== 'occasion' && typeof value === 'string' && value.trim())
      .map(([key]) => key);
    setInterviewMessages([]);
    setInterviewAnswers(seededAnswers);
    setResolvedFields(seededFields);
    setCurrentField(null);
    setInterviewComplete(false);
    void interview('start', {
      answers: seededAnswers,
      resolvedFields: seededFields,
      currentField: null,
      messages: [],
    });
  }

  function skipCurrentQuestion() {
    if (!currentField) return;
    const nextResolved = [...new Set([...resolvedFields, currentField])];
    setResolvedFields(nextResolved);
    setCurrentField(null);
    void interview('start', {
      answers: interviewAnswers,
      resolvedFields: nextResolved,
      currentField: null,
      messages: interviewMessages,
    });
  }

  async function sendFollowUp() {
    const message = followUpDraft.trim().slice(0, 300);
    if (!message) return;
    const intent = classifyAssistantFollowUp(message);
    if (intent.kind === 'regenerate' && intent.reason) {
      onRegenerate?.(intent.reason);
      setFollowUpDraft('');
      setAssistantResult({
        mode: 'fallback',
        explanation:
          'I’ve applied that preference to the next recommendations. They will still use only items saved in your wardrobe.',
      });
      return;
    }
    setFollowUpDraft('');
    await explainLook(message);
  }

  return (
    <Card style={{ gap: 12 }}>
      <SectionTitle
        title="AI planning help"
        detail="AI can explain or refine a brief. It never creates outfits or adds clothes to your wardrobe."
      />

      {!state.settings.aiEnabled ? (
        <InlineNotice>Turn on optional AI assistance in Settings to use these tools.</InlineNotice>
      ) : !session?.user ? (
        <View style={{ gap: 9 }}>
          <InlineNotice>Sign in to use the existing Wearwell AI services. Your local brief and outfit suggestions still work.</InlineNotice>
          <ActionButton
            compact
            variant="outline"
            label="Sign in"
            icon="log-in"
            onPress={() => router.push('/account')}
          />
        </View>
      ) : !supabase ? (
        <InlineNotice tone="error">AI planning is not configured in this app build.</InlineNotice>
      ) : (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <ActionButton
              compact
              variant="outline"
              label={busy ? 'Working…' : 'Help me refine my brief'}
              icon="message-circle"
              disabled={busy}
              onPress={() => {
                if (interviewOpen) {
                  setInterviewOpen(false);
                } else {
                  startInterview();
                }
              }}
            />
            <ActionButton
              compact
              variant="outline"
              label={busy ? 'Working…' : 'Explain a generated look'}
              icon="help-circle"
              disabled={busy || !candidate}
              onPress={() => void explainLook()}
            />
          </View>

          {assistantResult ? (
            <View style={{ gap: 9, padding: 12, borderRadius: 12, backgroundColor: colors.background }}>
              {assistantResult.mode === 'ai' ? (
                <>
                  <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>
                    Details to review
                  </Text>
                  {Object.entries(assistantResult.fields).map(([key, value]) =>
                    typeof value === 'string' && value.trim() ? (
                      <Text key={key} style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18 }}>
                        <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold' }}>
                          {FIELD_LABELS[key] || key}:{' '}
                        </Text>
                        {value}
                      </Text>
                    ) : null,
                  )}
                  <Text style={{ color: colors.foreground, fontSize: 12, lineHeight: 18 }}>
                    {assistantResult.explanation}
                  </Text>
                  {assistantResult.followUpQuestion ? (
                    <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18 }}>
                      {assistantResult.followUpQuestion}
                    </Text>
                  ) : null}
                  <TextInput
                    accessibilityLabel="Ask a follow-up about this look"
                    value={followUpDraft}
                    onChangeText={setFollowUpDraft}
                    placeholder="Ask a follow-up or request a different feel…"
                    placeholderTextColor={colors.mutedForeground}
                    multiline
                    maxLength={300}
                    style={{
                      minHeight: 60,
                      padding: 10,
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 10,
                      color: colors.foreground,
                      backgroundColor: colors.card,
                      fontSize: 12,
                      lineHeight: 18,
                    }}
                  />
                  <VoiceDictationButton
                    language={state.settings.voiceLanguage}
                    onTranscript={(transcript) =>
                      setReply((current) => `${current.trim()} ${transcript}`.trim().slice(0, 300))
                    }
                  />
                  <ActionButton
                    compact
                    label={busy ? 'Working…' : 'Send follow-up'}
                    icon="arrow-right"
                    disabled={busy || !followUpDraft.trim()}
                    onPress={() => void sendFollowUp()}
                  />
                  <ActionButton
                    compact
                    label="Add reviewed details to my day"
                    icon="check"
                    onPress={() => {
                      const detailLines = Object.entries(assistantResult.fields)
                        .filter(([key, value]) => key in FIELD_LABELS && typeof value === 'string' && value.trim())
                        .map(([key, value]) => `${FIELD_LABELS[key]}: ${String(value).trim()}`);
                      if (activeEvent) {
                        const nextDayBrief = {
                          ...activeEvent.dayBrief,
                          ...Object.fromEntries(
                            Object.entries(assistantResult.fields)
                              .filter(([key, value]) => key in FIELD_LABELS && typeof value === 'string')
                              .map(([key, value]) => [key, String(value).trim().slice(0, 160)]),
                          ),
                        };
                        updateDayEvent(activeEvent.id, {
                          dayBrief: nextDayBrief,
                          excludedItemSets: [],
                          regenerationReason: '',
                          ...(nextDayBrief.occasion
                            ? { label: nextDayBrief.occasion, description: nextDayBrief.occasion }
                            : {}),
                          ...(nextDayBrief.timeWindow
                            ? { timeWindow: nextDayBrief.timeWindow }
                            : {}),
                        });
                      } else {
                        setBrief([state.brief.trim(), ...detailLines].filter(Boolean).join('\n').slice(0, 1200));
                      }
                      setAssistantResult(null);
                    }}
                  />
                </>
              ) : (
                <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18 }}>
                  {assistantResult.explanation}
                </Text>
              )}
            </View>
          ) : null}

          {interviewOpen ? (
            <View style={{ gap: 10, padding: 12, borderRadius: 12, backgroundColor: colors.background }}>
              <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>
                Brief interview
              </Text>
              {interviewMessages.slice(-6).map((message, index) => (
                <Text
                  key={`${index}-${message.role}`}
                  style={{ color: message.role === 'assistant' ? colors.foreground : colors.mutedForeground, fontSize: 12, lineHeight: 18 }}
                >
                  {message.role === 'assistant' ? 'Wearwell: ' : 'You: '}
                  {message.content}
                </Text>
              ))}
              {!interviewComplete ? (
                <>
                  <TextInput
                    accessibilityLabel="Your answer to the Wearwell assistant"
                    value={reply}
                    onChangeText={setReply}
                    placeholder={currentField ? 'Add the detail you want Wearwell to consider…' : 'Add anything else that matters…'}
                    placeholderTextColor={colors.mutedForeground}
                    multiline
                    maxLength={300}
                    style={{
                      minHeight: 72,
                      padding: 11,
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 11,
                      color: colors.foreground,
                      backgroundColor: colors.card,
                      fontSize: 13,
                      lineHeight: 18,
                    }}
                  />
                  <ActionButton
                    compact
                    label={busy ? 'Sending…' : 'Send answer'}
                    icon="arrow-right"
                    disabled={busy || !reply.trim()}
                    onPress={() => void interview('reply')}
                  />
                  {currentField ? (
                    <ActionButton
                      compact
                      variant="quiet"
                      label="Skip this question"
                      icon="skip-forward"
                      disabled={busy}
                      onPress={skipCurrentQuestion}
                    />
                  ) : null}
                </>
              ) : (
                <ActionButton
                  compact
                  label="Use these details in my day"
                  icon="check"
                  onPress={applyInterviewAnswers}
                />
              )}
            </View>
          ) : null}
        </>
      )}
      {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
    </Card>
  );
}