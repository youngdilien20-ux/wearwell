import React, { useState } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useWearwell } from '@/context/WearwellContext';
import { useColors } from '@/hooks/useColors';
import {
  ActionButton,
  BrandHeader,
  Card,
  InlineNotice,
  PageTitle,
  ScreenScroll,
  SectionTitle,
} from '@/components/WearwellUI';

type FormMode = 'signIn' | 'signUp' | 'reset';

export default function AccountScreen() {
  const colors = useColors();
  const router = useRouter();
  const { session, isLoading, cloudEnabled, signIn, signUp, sendPasswordReset, signOut } = useAuth();
  const { cloudSyncStatus, cloudSyncError, retryCloudSync } = useWearwell();
  const [mode, setMode] = useState<FormMode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function submit() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (mode === 'reset') {
        await sendPasswordReset(email);
        setMessage('If that email has an account, a password reset link has been sent.');
      } else if (mode === 'signUp') {
        const signedIn = await signUp(email, password);
        setMessage(
          signedIn
            ? 'Your account is ready and signed in.'
            : 'Check your email to confirm your account, then sign in here.',
        );
        if (signedIn) setMode('signIn');
      } else {
        await signIn(email, password);
      }
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'That request could not be completed. Try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScreenScroll>
      <BrandHeader caption="ACCOUNT & SYNC" />
      <PageTitle
        title={session ? 'Your Wearwell account' : 'Sync your wardrobe'}
        subtitle="Use the same account as Wearwell on the web to keep your clothes, profile, preferences, and saved looks together."
      />

      {!cloudEnabled ? (
        <InlineNotice tone="error">
          Account sync is not configured in this app build. Your on-device wardrobe still works.
        </InlineNotice>
      ) : isLoading ? (
        <Card style={{ alignItems: 'center', gap: 12 }}>
          <ActivityIndicator color={colors.plum} />
          <Text style={{ color: colors.mutedForeground }}>Checking your account…</Text>
        </Card>
      ) : session ? (
        <>
          <Card style={{ gap: 12 }}>
            <SectionTitle title="Signed in" detail={session.user.email || 'Wearwell account'} />
            <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18 }}>
              Cloud sync status: {cloudSyncStatus}
            </Text>
            {cloudSyncError ? <InlineNotice tone="error">{cloudSyncError}</InlineNotice> : null}
            {cloudSyncStatus === 'error' ? (
              <ActionButton
                compact
                variant="outline"
                label="Retry cloud sync"
                icon="refresh-cw"
                onPress={retryCloudSync}
              />
            ) : null}
            <ActionButton
              variant="outline"
              label="Sign out"
              icon="log-out"
              onPress={() => {
                setBusy(true);
                void signOut()
                  .catch((signOutError) =>
                    setError(
                      signOutError instanceof Error
                        ? signOutError.message
                        : 'Could not sign out. Try again.',
                    ),
                  )
                  .finally(() => setBusy(false));
              }}
              disabled={busy}
            />
          </Card>
          {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
        </>
      ) : (
        <Card style={{ gap: 13 }}>
          <SectionTitle
            title={mode === 'reset' ? 'Reset your password' : mode === 'signUp' ? 'Create an account' : 'Sign in'}
            detail="Your email and password are managed by Wearwell’s secure sign-in service."
          />
          <TextInput
            accessibilityLabel="Email address"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="you@example.com"
            placeholderTextColor={colors.mutedForeground}
            style={{
              minHeight: 48,
              paddingHorizontal: 13,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 12,
              color: colors.foreground,
              backgroundColor: colors.background,
            }}
          />
          {mode !== 'reset' ? (
            <TextInput
              accessibilityLabel="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
              placeholder={mode === 'signUp' ? 'At least 8 characters' : 'Password'}
              placeholderTextColor={colors.mutedForeground}
              style={{
                minHeight: 48,
                paddingHorizontal: 13,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 12,
                color: colors.foreground,
                backgroundColor: colors.background,
              }}
            />
          ) : null}
          {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
          {message ? <InlineNotice>{message}</InlineNotice> : null}
          <ActionButton
            label={busy ? 'Please wait…' : mode === 'reset' ? 'Send reset link' : mode === 'signUp' ? 'Create account' : 'Sign in'}
            icon={busy ? 'clock' : mode === 'reset' ? 'mail' : 'log-in'}
            disabled={busy || !email.trim() || (mode !== 'reset' && password.length < 8)}
            onPress={() => void submit()}
          />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {mode !== 'signIn' ? (
              <ActionButton compact variant="quiet" label="Back to sign in" onPress={() => setMode('signIn')} />
            ) : (
              <>
                <ActionButton compact variant="quiet" label="Create account" onPress={() => setMode('signUp')} />
                <ActionButton compact variant="quiet" label="Forgot password?" onPress={() => setMode('reset')} />
              </>
            )}
          </View>
        </Card>
      )}

      <ActionButton
        variant="quiet"
        label="Done"
        icon="arrow-left"
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
      />
    </ScreenScroll>
  );
}