import React, { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
  ActionButton,
  InlineNotice,
} from '@/components/WearwellUI';
// @ts-ignore Shared transcript helper is a plain JavaScript module.
import { transcriptFromRecognitionResults } from '../../../src/speechRecognition.mjs';

type BrowserRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type BrowserWindow = Window & {
  SpeechRecognition?: new () => BrowserRecognition;
  webkitSpeechRecognition?: new () => BrowserRecognition;
};

export function VoiceDictationButton({
  language,
  onStart,
  onTranscript,
}: {
  language: string;
  onStart?: () => void;
  onTranscript: (transcript: string) => void;
}) {
  const recognitionRef = useRef<BrowserRecognition | null>(null);
  const transcriptSubmittedRef = useRef(false);
  const [available, setAvailable] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const browser = window as BrowserWindow;
    setAvailable(Boolean(browser.SpeechRecognition || browser.webkitSpeechRecognition));
  }, []);

  useEffect(
    () => () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    },
    [],
  );

  function toggleListening() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    if (typeof window === 'undefined') return;
    const browser = window as BrowserWindow;
    const Recognition = browser.SpeechRecognition || browser.webkitSpeechRecognition;
    if (!Recognition) return;

    setError('');
    transcriptSubmittedRef.current = false;
    const recognition = new Recognition();
    recognition.lang = language || 'en-GB';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      if (transcriptSubmittedRef.current) return;
      const transcript = transcriptFromRecognitionResults(event.results);
      if (!transcript) return;
      transcriptSubmittedRef.current = true;
      try {
        recognition.stop();
      } catch {
        // Keep the transcript even if the browser already ended recognition.
      }
      onTranscript(transcript);
    };
    recognition.onerror = (event) => {
      if (event.error !== 'aborted' && event.error !== 'no-speech') {
        setError('Voice input is unavailable. You can keep typing instead.');
      }
      setListening(false);
      recognitionRef.current = null;
    };
    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };

    try {
      onStart?.();
      recognitionRef.current = recognition;
      setListening(true);
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setListening(false);
      setError('Voice input could not start. You can keep typing instead.');
    }
  }

  if (Platform.OS !== 'web' || !available) return null;

  return (
    <>
      <ActionButton
        compact
        variant={listening ? 'secondary' : 'outline'}
        label={listening ? 'Listening…' : 'Speak'}
        icon={listening ? 'mic-off' : 'mic'}
        onPress={toggleListening}
        accessibilityLabel={listening ? 'Stop voice input' : 'Start voice input'}
      />
      {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
    </>
  );
}