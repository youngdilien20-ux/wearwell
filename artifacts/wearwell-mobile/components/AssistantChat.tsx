import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Speech from 'expo-speech';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import { useColors } from '@/hooks/useColors';
import { useWearwell } from '@/context/WearwellContext';
import { supabase } from '@/lib/supabase';
import { VoiceDictationButton } from '@/components/VoiceDictationButton';
import {
  ActionButton,
  InlineNotice,
} from '@/components/WearwellUI';
// @ts-ignore Shared assistant helpers are plain JavaScript modules.
import {
  buildAssistantConversationFromBrief,
  buildAssistantConversationFromMessages,
} from '../../../src/assistantPlanning.mjs';
// @ts-ignore Shared day-plan helpers are plain JavaScript modules.
import { eventStateFor, normalizeDayPlan } from '../../../src/dayPlan.mjs';
// @ts-ignore Shared wardrobe-gap guidance is a plain JavaScript module.
import {
  buildWardrobeGapPlan,
  budgetGuidanceFor,
  WARDROBE_BUDGET_OPTIONS,
} from '../../../src/wardrobeGapPlanning.mjs';

const FIELD_KEYS = [
  'occasion',
  'timeWindow',
  'duration',
  'movement',
  'dressCode',
  'mood',
  'comfortNeeds',
  'coverageNeeds',
];

const FIELD_LIMITS: Record<string, number> = {
  occasion: 120,
  timeWindow: 80,
  duration: 80,
  movement: 160,
  dressCode: 100,
  mood: 120,
  comfortNeeds: 160,
  coverageNeeds: 120,
};

const FIELD_LABELS: Record<string, string> = {
  occasion: 'Occasion',
  timeWindow: 'Time window',
  duration: 'Duration',
  movement: 'Movement',
  dressCode: 'Dress code',
  mood: 'Mood / feel',
  comfortNeeds: 'Comfort',
  coverageNeeds: 'Coverage',
};

type ChatMessage = { role: 'user' | 'assistant'; text: string };

function assistantValues(source: Record<string, unknown> | null | undefined) {
  return Object.fromEntries(
    FIELD_KEYS.map((key) => [
      key,
      typeof source?.[key] === 'string'
        ? (source[key] as string).trim().slice(0, FIELD_LIMITS[key])
        : '',
    ]),
  ) as Record<string, string>;
}

function ChatBubble({ message, colors }: { message: ChatMessage; colors: any }) {
  const isUser = message.role === 'user';
  return (
    <View
      accessibilityRole="text"
      style={{
        alignSelf: isUser ? 'flex-end' : 'flex-start',
        maxWidth: '92%',
        paddingHorizontal: 12,
        paddingVertical: 9,
        borderRadius: 12,
        borderBottomRightRadius: isUser ? 4 : 12,
        borderBottomLeftRadius: isUser ? 12 : 4,
        backgroundColor: isUser ? colors.primary : colors.card,
        borderWidth: isUser ? 0 : 1,
        borderColor: colors.border,
      }}
    >
      <Text style={{ color: isUser ? colors.primaryForeground : colors.foreground, fontSize: 13, lineHeight: 19 }}>
        {message.text}
      </Text>
    </View>
  );
}

function GapFollowUp({
  plan,
  onOpenWardrobe,
  onReviewBrief,
}: {
  plan: any;
  onOpenWardrobe: () => void;
  onReviewBrief: () => void;
}) {
  const colors = useColors();
  const [step, setStep] = useState<'choice' | 'budget' | 'shopping' | 'wardrobe'>('choice');
  const [budgetId, setBudgetId] = useState('');
  const budget = WARDROBE_BUDGET_OPTIONS.find((option: any) => option.id === budgetId);

  function GapMessage({ children, user = false }: { children: React.ReactNode; user?: boolean }) {
    return (
      <View
        style={{
          alignSelf: user ? 'flex-end' : 'flex-start',
          maxWidth: '95%',
          padding: 11,
          borderRadius: 11,
          backgroundColor: user ? colors.primary : colors.card,
          borderWidth: user ? 0 : 1,
          borderColor: colors.border,
        }}
      >
        <Text style={{ color: user ? colors.primaryForeground : colors.foreground, fontSize: 12, lineHeight: 18 }}>
          {children}
        </Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 10, marginTop: 8 }}>
      {step === 'choice' ? (
        <>
          <GapMessage>
            I couldn’t confirm a complete outfit from your available wardrobe for this brief. Would you like a buying plan, or should we start with the clothes you already own?
          </GapMessage>
          <View style={{ gap: 8 }}>
            <ActionButton
              compact
              variant="outline"
              label="Plan what to buy"
              icon="shopping-bag"
              onPress={() => setStep('budget')}
            />
            <ActionButton
              compact
              variant="outline"
              label="Use what I own"
              icon="grid"
              onPress={() => setStep('wardrobe')}
            />
          </View>
        </>
      ) : null}

      {step === 'budget' ? (
        <>
          <GapMessage user>Plan what to buy</GapMessage>
          <GapMessage>What budget should I use for your shopping plan?</GapMessage>
          <View style={{ gap: 8 }}>
            {WARDROBE_BUDGET_OPTIONS.map((option: any) => (
              <Pressable
                key={option.id}
                accessibilityRole="button"
                onPress={() => {
                  setBudgetId(option.id);
                  setStep('shopping');
                }}
                style={{
                  gap: 4,
                  padding: 12,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 11,
                  backgroundColor: colors.card,
                }}
              >
                <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>
                  {option.label}
                </Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16 }}>
                  {option.detail}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      {step === 'shopping' && budget ? (
        <>
          <GapMessage user>{budget.label}</GapMessage>
          <GapMessage>
            Here’s a shopping direction based on the gaps I can see. These are clothing categories and fit checks, not live products or store prices.
          </GapMessage>
          <View style={{ gap: 10, padding: 12, borderRadius: 11, backgroundColor: colors.background }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>
                What to look for
              </Text>
              <ActionButton compact variant="quiet" label="Change budget" onPress={() => setStep('budget')} />
            </View>
            <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18 }}>
              {budgetGuidanceFor(budget.id)}
            </Text>
            {plan.shoppingRoutes.map((route: any) => (
              <View key={route.id} style={{ gap: 3 }}>
                <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>
                  {route.title}
                </Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16 }}>
                  {route.detail}
                </Text>
              </View>
            ))}
            {plan.requirements.length ? (
              <View style={{ gap: 5 }}>
                <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>
                  Check these needs when shopping
                </Text>
                {plan.requirements.map(({ label, value }: any) => (
                  <Text key={label} style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16 }}>
                    {label}: {value}
                  </Text>
                ))}
              </View>
            ) : (
              <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16 }}>
                No specific fit requirements were recorded. Check comfort and fit before buying.
              </Text>
            )}
            <Text style={{ color: colors.mutedForeground, fontSize: 10, lineHeight: 15 }}>
              Wearwell doesn’t have a product catalog or current prices, so this plan won’t invent store listings or costs.
            </Text>
          </View>
        </>
      ) : null}

      {step === 'wardrobe' ? (
        <>
          <GapMessage user>Show me what I can use from my wardrobe</GapMessage>
          <GapMessage>
            I won’t label these as a complete outfit when they don’t meet the brief yet. Here are the real pieces currently marked available.
          </GapMessage>
          <View style={{ gap: 8 }}>
            {plan.availableItems.length ? (
              plan.availableItems.map((item: any) => (
                <View
                  key={item.id}
                  style={{
                    gap: 3,
                    padding: 10,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 10,
                    backgroundColor: colors.card,
                  }}
                >
                  <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>
                    {item.name}
                  </Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>
                    {item.type || 'Wardrobe item'} · {item.tone || item.note || item.color || 'Saved in your wardrobe'}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18 }}>
                There are no pieces marked available yet. Add a few items to your wardrobe and we can build from them.
              </Text>
            )}
            {!plan.hasCompleteBase ? (
              <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16 }}>
                {plan.missingCategories.includes('top') && plan.missingCategories.includes('bottom')
                  ? 'A top-and-bottom pair or one-piece item is still needed for a complete outfit.'
                  : `Your wardrobe still needs ${plan.missingCategories.map((category: string) => category === 'onePiece' ? 'a one-piece outfit' : `a ${category}`).join(' or ')} for a complete outfit.`}
              </Text>
            ) : null}
            {plan.requirements.map(({ label, value }: any) => (
              <Text key={label} style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16 }}>
                {label}: {value}
              </Text>
            ))}
            <ActionButton compact label="Open my wardrobe" icon="grid" onPress={onOpenWardrobe} />
            <ActionButton compact variant="outline" label="Review outfit needs" icon="edit-2" onPress={onReviewBrief} />
          </View>
        </>
      ) : null}

      {step !== 'choice' ? (
        <ActionButton compact variant="quiet" label="Back to choices" onPress={() => setStep('choice')} />
      ) : null}
    </View>
  );
}

export function AssistantChat({
  hasRecommendations,
  processRequest,
  showWardrobeGap,
  onReviewBrief,
}: {
  hasRecommendations: boolean;
  processRequest: number;
  showWardrobeGap: boolean;
  onReviewBrief: () => void;
}) {
  const colors = useColors();
  const router = useRouter();
  const { state, setBrief, updateDayEvent } = useWearwell();
  const dayPlan = useMemo(
    () => normalizeDayPlan(state.dayPlan, { fallbackBrief: state.brief }),
    [state.dayPlan, state.brief],
  );
  const activeEvent = eventStateFor(dayPlan, dayPlan.activeEventId);
  const dayBrief = activeEvent?.dayBrief || {};
  const gapPlan = useMemo(
    () => buildWardrobeGapPlan(state.wardrobe, dayBrief),
    [state.wardrobe, dayBrief],
  );

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [resolvedFields, setResolvedFields] = useState<string[]>([]);
  const [currentField, setCurrentField] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<
    'idle' | 'thinking' | 'speaking' | 'listening'
  >('idle');
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const requestId = useRef(0);
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const voiceModeRef = useRef(false);
  const voiceRecognitionActiveRef = useRef(false);
  const voicePermissionGrantedRef = useRef(false);
  const voiceTurnInFlightRef = useRef(false);
  const voiceListenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceSpeechRequestRef = useRef(0);
  const lastSubmittedAnswer = useRef('');

  useSpeechRecognitionEvent('start', () => {
    if (voiceModeRef.current && !voiceTurnInFlightRef.current) {
      setVoiceStatus('listening');
    }
  });

  useSpeechRecognitionEvent('result', (event) => {
    if (!voiceModeRef.current) return;
    const transcript = event.results
      .map((result) => result.transcript)
      .filter((segment) => typeof segment === 'string' && segment.trim())
      .join(' ')
      .trim()
      .slice(0, 500);
    if (!transcript) return;
    setVoiceTranscript(transcript);
    if (event.isFinal) handleVoiceTranscript(transcript);
  });

  useSpeechRecognitionEvent('end', () => {
    voiceRecognitionActiveRef.current = false;
    if (voiceModeRef.current && !voiceTurnInFlightRef.current) {
      scheduleVoiceListening();
    }
  });

  useSpeechRecognitionEvent('error', (event) => {
    voiceRecognitionActiveRef.current = false;
    if (!voiceModeRef.current) return;
    if (event.error === 'aborted') {
      if (!voiceTurnInFlightRef.current) scheduleVoiceListening();
      return;
    }
    if (event.error === 'no-speech') {
      scheduleVoiceListening();
      return;
    }
    setError(
      event.error === 'not-allowed'
        ? 'Microphone or speech recognition access was declined. You can continue by typing.'
        : 'Voice input stopped. You can continue by typing or start voice chat again.',
    );
    setVoiceModeEnabled(false);
  });

  useEffect(
    () => () => {
      requestId.current += 1;
      voiceModeRef.current = false;
      voiceRecognitionActiveRef.current = false;
      if (voiceListenTimerRef.current) clearTimeout(voiceListenTimerRef.current);
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {
        // The recognizer may already be stopped during unmount.
      }
      void Speech.stop();
    },
    [],
  );

  useEffect(() => {
    if (voiceModeRef.current && !state.settings.speechEnabled) {
      setError('Turn on spoken replies in Settings before starting voice chat.');
      setVoiceModeEnabled(false);
    }
  }, [state.settings.speechEnabled]);

  useEffect(() => {
    if (processRequest > 0) processCurrentBrief();
    // The counter changes only when the user explicitly presses the brief action.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processRequest]);

  function setVoiceModeEnabled(enabled: boolean) {
    voiceModeRef.current = enabled;
    setVoiceMode(enabled);
    if (enabled) {
      voiceTurnInFlightRef.current = false;
      voiceRecognitionActiveRef.current = false;
      return;
    }
    if (voiceListenTimerRef.current) clearTimeout(voiceListenTimerRef.current);
    voiceListenTimerRef.current = null;
    voiceRecognitionActiveRef.current = false;
    voiceTurnInFlightRef.current = false;
    voiceSpeechRequestRef.current += 1;
    setVoiceTranscript('');
    setVoiceStatus('idle');
    try {
      ExpoSpeechRecognitionModule.abort();
    } catch {
      // The recognizer may already be stopped when voice chat is turned off.
    }
    void Speech.stop();
  }

  function speakVoicePrompt(text: string, afterSpeech?: () => void) {
    if (!voiceModeRef.current || !state.settings.speechEnabled || !text.trim()) return;
    const currentSpeechRequest = ++voiceSpeechRequestRef.current;
    voiceTurnInFlightRef.current = true;
    setVoiceStatus('speaking');
    try {
      void Speech.stop();
      Speech.speak(text, {
        language: state.settings.voiceLanguage || 'en-GB',
        voice: state.settings.speechVoiceId || undefined,
        rate: 0.92,
        onDone: () => {
          if (
            currentSpeechRequest !== voiceSpeechRequestRef.current ||
            !voiceModeRef.current
          ) return;
          setVoiceStatus('idle');
          if (afterSpeech) afterSpeech();
          else scheduleVoiceListening();
        },
        onStopped: () => {
          if (
            currentSpeechRequest === voiceSpeechRequestRef.current &&
            voiceModeRef.current
          ) {
            setVoiceStatus('idle');
          }
        },
        onError: () => {
          if (
            currentSpeechRequest !== voiceSpeechRequestRef.current ||
            !voiceModeRef.current
          ) return;
          setVoiceStatus('idle');
          setError('Speech is not available on this device. You can continue by typing.');
          setVoiceModeEnabled(false);
        },
      });
    } catch {
      setVoiceStatus('idle');
      setError('Speech is not available on this device. You can continue by typing.');
      setVoiceModeEnabled(false);
    }
  }

  function speakAssistantMessage(text: string, isComplete = false) {
    if (!voiceModeRef.current || !state.settings.speechEnabled || !text.trim()) return;
    if (isComplete) {
      speakVoicePrompt(text, () =>
        speakVoicePrompt(
          'That’s everything I need. Say “show me my recommendations” when you’re ready, or add another detail.',
        ),
      );
      return;
    }
    speakVoicePrompt(text);
  }

  function scheduleVoiceListening() {
    if (!voiceModeRef.current) return;
    if (voiceListenTimerRef.current) clearTimeout(voiceListenTimerRef.current);
    if (busyRef.current) {
      setVoiceStatus('thinking');
      return;
    }
    voiceTurnInFlightRef.current = false;
    setVoiceStatus('listening');
    voiceListenTimerRef.current = setTimeout(() => {
      voiceListenTimerRef.current = null;
      if (
        !voiceModeRef.current ||
        voiceTurnInFlightRef.current ||
        voiceRecognitionActiveRef.current
      ) return;
      if (!voicePermissionGrantedRef.current) {
        setError('Allow microphone and speech-recognition access to use voice chat.');
        setVoiceModeEnabled(false);
        return;
      }
      setVoiceTranscript('');
      try {
        voiceRecognitionActiveRef.current = true;
        ExpoSpeechRecognitionModule.start({
          lang: state.settings.voiceLanguage || 'en-GB',
          interimResults: true,
          continuous: false,
          maxAlternatives: 1,
        });
      } catch {
        voiceRecognitionActiveRef.current = false;
        setError(
          Platform.OS === 'web'
            ? 'Voice recognition is unavailable in this browser. You can continue by typing.'
            : 'Voice recognition could not start. Use a Wearwell development build on iOS or Android, or continue by typing.',
        );
        setVoiceModeEnabled(false);
      }
    }, 450);
  }

  function handleVoiceTranscript(rawTranscript: string) {
    if (!voiceModeRef.current || voiceTurnInFlightRef.current) return;
    const transcript = rawTranscript.trim().slice(0, 500);
    if (!transcript) return;
    voiceTurnInFlightRef.current = true;
    setVoiceTranscript('');
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      // The final result may arrive after the recognizer has ended its session.
    }

    const command = transcript
      .replace(/[.!?,;:]+$/g, '')
      .replace(/\s+/g, ' ')
      .toLowerCase();
    if (
      [
        'stop',
        'stop voice',
        'stop voice chat',
        'stop listening',
        'pause voice',
        'pause voice chat',
        'pause listening',
        'end voice chat',
        'end voice conversation',
        'cancel voice chat',
        'turn off voice chat',
      ].includes(command)
    ) {
      setVoiceModeEnabled(false);
      setError('Voice chat stopped. You can continue by typing or resume voice chat.');
      return;
    }

    if (error && /\b(?:retry|try again)\b/i.test(transcript)) {
      if (currentField && lastSubmittedAnswer.current) {
        submitReply(lastSubmittedAnswer.current);
      } else {
        startAssistantInterview(initialBriefForChat());
      }
      return;
    }

    if (complete) {
      const requestsRecommendations =
        /\b(?:show|see|view|display|bring up|open|ready)\b.*\b(?:recommendations?|outfits?|looks?)\b/i.test(
          transcript,
        ) ||
        /\b(?:i am|i'm|we are|we're) ready\b/i.test(transcript);
      if (requestsRecommendations) {
        setVoiceModeEnabled(false);
        if (hasRecommendations) closeChat();
        else finishAndReview();
        return;
      }
      const updatedBrief = [initialBriefForChat(), transcript]
        .filter(Boolean)
        .join(' ')
        .slice(0, 1500);
      setBrief(updatedBrief);
      startAssistantInterview(updatedBrief);
      return;
    }

    if (currentField) {
      submitReply(transcript);
      return;
    }
    const updatedBrief = [initialBriefForChat(), transcript]
      .filter(Boolean)
      .join(' ')
      .slice(0, 1500);
    setBrief(updatedBrief);
    startAssistantInterview(updatedBrief);
  }

  function applyAnswers(nextAnswers: Record<string, string>) {
    const changes = Object.fromEntries(
      FIELD_KEYS
        .filter((key) => {
          const answer = typeof nextAnswers[key] === 'string' ? nextAnswers[key].trim() : '';
          return answer && answer !== (dayBrief?.[key] || '');
        })
        .map((key) => [key, nextAnswers[key].trim().slice(0, FIELD_LIMITS[key])]),
    );
    if (!Object.keys(changes).length) return;

    if (activeEvent?.id) {
      updateDayEvent(activeEvent.id, {
        dayBrief: { ...(activeEvent.dayBrief || {}), ...changes },
        excludedItemSets: [],
        regenerationReason: '',
      });
    } else {
      const detailLines = Object.entries(changes)
        .filter(([, value]) => value)
        .map(([key, value]) => `${FIELD_LABELS[key]}: ${value}`);
      setBrief([state.brief.trim(), ...detailLines].filter(Boolean).join('\n').slice(0, 1200));
    }
  }

  async function requestAssistantChat(
    payload: Record<string, any>,
    userMessage = '',
  ) {
    if (!supabase) return;
    const currentRequestId = ++requestId.current;
    if (voiceModeRef.current) setVoiceStatus('thinking');
    setBusy(true);
    setError('');

    try {
      const conversation = payload.action === 'reply'
        ? buildAssistantConversationFromMessages(messages)
        : Array.isArray(payload.conversation) ? payload.conversation : [];
      const timeoutSignal =
        typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
          ? AbortSignal.timeout(15000)
          : undefined;
      const { data, error: invokeError } = await supabase.functions.invoke(
        'brief-interview',
        {
          body: { ...payload, conversation },
          signal: timeoutSignal,
        },
      );
      if (invokeError) throw invokeError;
      if (currentRequestId !== requestId.current) return;
      if (
        !data ||
        typeof data.assistantMessage !== 'string' ||
        !data.answers ||
        typeof data.answers !== 'object' ||
        !Array.isArray(data.resolvedFields)
      ) {
        throw new Error('The assistant returned an invalid response.');
      }

      const nextAnswers = assistantValues(data.answers);
      const nextResolvedFields = data.resolvedFields.filter((key: unknown) =>
        typeof key === 'string' && FIELD_KEYS.includes(key),
      );
      const assistantMessage = data.assistantMessage.slice(0, 360);
      applyAnswers(nextAnswers);
      setAnswers(nextAnswers);
      setResolvedFields(nextResolvedFields);
      setCurrentField(
        typeof data.currentField === 'string' && FIELD_KEYS.includes(data.currentField)
          ? data.currentField
          : null,
      );
      setComplete(data.isComplete === true);
      setFallback(data.mode !== 'ai');
      setMessages((current) => [
        ...current,
        ...(userMessage ? [{ role: 'user' as const, text: userMessage }] : []),
        { role: 'assistant' as const, text: assistantMessage },
      ].slice(-16));
      if (userMessage) {
        setDraft('');
        lastSubmittedAnswer.current = '';
      }
      speakAssistantMessage(assistantMessage, data.isComplete === true);
    } catch {
      if (currentRequestId !== requestId.current) return;
      setVoiceStatus('idle');
      setError('I couldn’t reach the assistant just now. Your saved brief is unchanged; please try again.');
      if (voiceModeRef.current) {
        speakVoicePrompt(
          'I couldn’t reach the assistant just now. Say “try again” to retry, or say “stop voice chat” to type instead.',
        );
      }
    } finally {
      if (currentRequestId === requestId.current) setBusy(false);
    }
  }

  function startAssistantInterview(initialBrief = '') {
    if (!supabase) return;
    const seededAnswers = assistantValues(dayBrief);
    // Do not treat the day view's default occasion as the user's intent.
    seededAnswers.occasion = '';
    const seededResolved = FIELD_KEYS.filter(
      (key) => key !== 'occasion' && Boolean(seededAnswers[key]),
    );
    setAnswers(seededAnswers);
    setResolvedFields(seededResolved);
    setCurrentField(null);
    setComplete(false);
    setFallback(false);
    setError('');
    setDraft('');
    setMessages([]);
    const conversation = buildAssistantConversationFromBrief(initialBrief);
    void requestAssistantChat({
      action: 'start',
      answers: seededAnswers,
      resolvedFields: seededResolved,
      currentField: null,
      latestAnswer: '',
      conversation,
    }, initialBrief.trim());
  }

  function initialBriefForChat() {
    const value = typeof state.brief === 'string' && state.brief.trim()
      ? state.brief
      : activeEvent?.brief;
    return typeof value === 'string' ? value.trim().slice(0, 1500) : '';
  }

  function processCurrentBrief() {
    const initialBrief = state.brief.trim();
    if (!initialBrief) {
      setError('Write or say a little about your day before processing your brief.');
      return;
    }
    if (initialBrief.length > 1500) {
      setError('Keep your brief to 1,500 characters or fewer so the assistant can process it.');
      return;
    }
    setOpen(true);
    setVoiceModeEnabled(false);
    setMessages([]);
    setDraft('');
    setError('');
    setFallback(false);
    setComplete(false);
    startAssistantInterview(initialBrief);
  }

  function closeChat() {
    setVoiceModeEnabled(false);
    requestId.current += 1;
    lastSubmittedAnswer.current = '';
    setBusy(false);
    setOpen(false);
  }

  function toggleChat() {
    if (open) {
      closeChat();
      return;
    }
    setOpen(true);
    setMessages([]);
    setDraft('');
    setError('');
    setFallback(false);
    setComplete(false);
    setVoiceModeEnabled(false);
    if (supabase) startAssistantInterview(initialBriefForChat());
  }

  function submitReply(value = draft) {
    const answer = value.trim();
    if (!answer || busy || complete || !currentField) return;
    lastSubmittedAnswer.current = answer;
    void requestAssistantChat({
      action: 'reply',
      answers,
      resolvedFields,
      currentField,
      latestAnswer: answer,
    }, answer === 'skip this question' ? 'Skip' : answer);
  }

  async function startVoiceChat() {
    if (!state.settings.speechEnabled) {
      setError('Turn on spoken replies in Settings before starting voice chat.');
      return;
    }
    setError('');
    setVoiceModeEnabled(true);
    setVoiceStatus('thinking');
    try {
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) {
        throw new Error('permission-denied');
      }
      voicePermissionGrantedRef.current = true;
      if (!voiceModeRef.current) return;
      if (busy) {
        setVoiceStatus('thinking');
      } else if (messages.length === 0 && supabase) {
        startAssistantInterview(initialBriefForChat());
      } else {
        const latestAssistantMessage = [...messages]
          .reverse()
          .find((message) => message.role === 'assistant');
        if (latestAssistantMessage) {
          speakAssistantMessage(latestAssistantMessage.text, complete);
        } else {
          scheduleVoiceListening();
        }
      }
    } catch {
      voicePermissionGrantedRef.current = false;
      setError(
        'Allow microphone and speech-recognition access to use voice chat. You can continue by typing.',
      );
      setVoiceModeEnabled(false);
    }
  }

  function finishAndReview() {
    closeChat();
    onReviewBrief();
  }

  return (
    <View style={{ gap: 10 }}>
      <ActionButton
        variant={open ? 'secondary' : 'outline'}
        label={open ? 'Close assistant' : 'Chat with assistant'}
        icon={open ? 'x' : 'message-circle'}
        onPress={toggleChat}
        accessibilityLabel={open ? 'Close assistant chat' : 'Start a chat with the Wearwell assistant'}
      />

      {open ? (
        <View
          accessibilityLabel="Chat with the Wearwell assistant"
          style={{
            gap: 11,
            padding: 13,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 13,
            backgroundColor: colors.background,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 14 }}>
                Wearwell assistant
              </Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16 }}>
                One question at a time. Skip anything you don’t know.
              </Text>
            </View>
            {voiceMode ? (
              <ActionButton
                compact
                variant="outline"
                label="Stop voice chat"
                icon="mic-off"
                onPress={() => setVoiceModeEnabled(false)}
              />
            ) : supabase ? (
              <ActionButton
                compact
                variant="outline"
                label={messages.length ? 'Resume voice chat' : 'Start voice chat'}
                icon="mic"
                onPress={startVoiceChat}
              />
            ) : null}
          </View>

          {!supabase ? (
            <InlineNotice tone="error">
              AI chat isn’t available right now. Your existing brief fields remain available.
            </InlineNotice>
          ) : (
            <>
              <Text style={{ color: colors.mutedForeground, fontSize: 10, lineHeight: 15 }}>
                This chat works without an account. Your brief and recent chat turns are sent to Gemini so it can follow what you mean. Your wardrobe, profile, and weather are not sent, and Wearwell does not save the chat. Avoid sharing sensitive personal information.
              </Text>

              {voiceMode ? (
                <InlineNotice>
                  {voiceStatus === 'thinking'
                    ? 'Wearwell is preparing a reply.'
                    : voiceStatus === 'speaking'
                      ? 'Wearwell is speaking.'
                      : voiceStatus === 'listening'
                        ? voiceTranscript
                          ? `Listening: ${voiceTranscript}`
                          : 'Listening for your reply. Say “stop voice chat” or tap Stop voice chat to pause.'
                        : 'Voice chat is on. Speak naturally; Wearwell will read each reply aloud and listen again.'}
                </InlineNotice>
              ) : null}

              {fallback ? (
                <InlineNotice>
                  AI is unavailable right now. I’ll keep this brief short; you can add any other details in the fields.
                </InlineNotice>
              ) : null}

              <View
                accessible
                accessibilityLabel="Assistant conversation"
                style={{
                  gap: 8,
                  paddingVertical: 2,
                }}
              >
                {messages.map((message, index) => (
                  <ChatBubble
                    key={`${message.role}-${index}`}
                    message={message}
                    colors={colors}
                  />
                ))}
                {busy ? (
                  <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>Thinking…</Text>
                ) : null}
                {!busy && messages.length === 0 ? (
                  <ActionButton
                    compact
                    variant="quiet"
                    label="Start the conversation"
                    icon="play"
                    onPress={() => startAssistantInterview(initialBriefForChat())}
                  />
                ) : null}
              </View>

              {error ? (
                <View style={{ gap: 6 }}>
                  <InlineNotice tone="error">{error}</InlineNotice>
                  <ActionButton
                    compact
                    variant="outline"
                    label={currentField ? 'Retry' : 'Try again'}
                    icon="rotate-ccw"
                    disabled={busy}
                    onPress={() => {
                      if (currentField) {
                        const previousDraft = draft.trim() || lastSubmittedAnswer.current;
                        if (previousDraft) submitReply(previousDraft);
                        else startAssistantInterview(initialBriefForChat());
                      } else {
                        startAssistantInterview(initialBriefForChat());
                      }
                    }}
                  />
                </View>
              ) : null}

              {complete ? (
                <View style={{ gap: 9 }}>
                  <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16 }}>
                    Your answers have been added to the brief and saved privately. You can edit any detail in the fields alongside it.
                  </Text>
                  {showWardrobeGap ? (
                    <GapFollowUp
                      plan={gapPlan}
                      onOpenWardrobe={() => {
                        closeChat();
                        router.navigate('/(tabs)/wardrobe');
                      }}
                      onReviewBrief={finishAndReview}
                    />
                  ) : (
                    <ActionButton
                      compact
                      label={hasRecommendations ? 'See recommendations' : 'Review outfit needs'}
                      icon="arrow-right"
                      onPress={() => {
                        if (hasRecommendations) closeChat();
                        else finishAndReview();
                      }}
                    />
                  )}
                </View>
              ) : currentField ? (
                <View style={{ gap: 8 }}>
                  <TextInput
                    accessibilityLabel="Your answer to the assistant"
                    value={draft}
                    onChangeText={setDraft}
                    placeholder="Tell me naturally; include anything that matters…"
                    placeholderTextColor={colors.mutedForeground}
                    selectionColor={colors.plum}
                    maxLength={500}
                    editable={!busy}
                    returnKeyType="send"
                    blurOnSubmit={false}
                    onSubmitEditing={() => submitReply()}
                    style={{
                      minHeight: 44,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 11,
                      color: colors.foreground,
                      backgroundColor: colors.card,
                      fontSize: 13,
                    }}
                  />
                  <VoiceDictationButton
                    language={state.settings.voiceLanguage}
                    onTranscript={(transcript) =>
                      setDraft((current) =>
                        `${current.trim()} ${transcript}`.trim().slice(0, 500),
                      )
                    }
                  />
                  <ActionButton
                    compact
                    label={busy ? 'Sending…' : 'Send'}
                    icon="arrow-right"
                    disabled={busy || !draft.trim()}
                    onPress={() => submitReply()}
                  />
                  <ActionButton
                    compact
                    variant="quiet"
                    label="Skip this question"
                    icon="skip-forward"
                    disabled={busy}
                    onPress={() => submitReply('skip this question')}
                  />
                </View>
              ) : null}
            </>
          )}
        </View>
      ) : null}
    </View>
  );
}