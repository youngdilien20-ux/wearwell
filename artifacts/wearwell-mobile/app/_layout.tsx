import React, { useEffect, useRef } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Platform, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as SplashScreen from 'expo-splash-screen';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '@/context/AuthContext';
import { WearwellProvider } from '@/context/WearwellContext';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

const STARTUP_PERMISSION_REQUESTS = [
  {
    key: 'microphone-and-speech-v3',
    request: () => ExpoSpeechRecognitionModule.requestPermissionsAsync(),
  },
  {
    key: 'camera',
    request: () => ImagePicker.requestCameraPermissionsAsync(),
  },
  {
    key: 'photos',
    request: () => ImagePicker.requestMediaLibraryPermissionsAsync(),
  },
] as const;

async function requestStartupPermissions() {
  if (Platform.OS === 'web') return;

  for (const step of STARTUP_PERMISSION_REQUESTS) {
    const storageKey = `wearwell:startup-permission:${step.key}`;
    try {
      if (await AsyncStorage.getItem(storageKey)) continue;
    } catch (error) {
      console.warn(`Could not read startup permission state for ${step.key}.`, error);
    }

    try {
      await step.request();
    } catch (error) {
      console.warn(`Could not request ${step.key} permission.`, error);
      continue;
    }

    try {
      await AsyncStorage.setItem(storageKey, 'requested');
    } catch (error) {
      console.warn(`Could not save startup permission state for ${step.key}.`, error);
    }
  }
}

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerBackTitle: 'Back' }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="account"
        options={{ presentation: 'modal', title: 'Your account' }}
      />
      <Stack.Screen
        name="profile"
        options={{ presentation: 'modal', title: 'Styling profile' }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const startupPermissionsStarted = useRef(false);
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if ((!fontsLoaded && !fontError) || startupPermissionsStarted.current) return;
    startupPermissionsStarted.current = true;
    void SplashScreen.hideAsync()
      .catch((error) => console.warn('Could not hide the splash screen.', error))
      .then(() => requestStartupPermissions());
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return undefined;
    const scrollbarStyle = document.createElement('style');
    scrollbarStyle.dataset.wearwellScrollbars = 'hidden';
    scrollbarStyle.textContent = `
      html, body, *, *::before, *::after {
        scrollbar-width: none !important;
        -ms-overflow-style: none !important;
      }
      *::-webkit-scrollbar,
      *::-webkit-scrollbar-track,
      *::-webkit-scrollbar-thumb {
        display: none !important;
        width: 0 !important;
        height: 0 !important;
        background: transparent !important;
      }
    `;
    document.head.appendChild(scrollbarStyle);
    return () => scrollbarStyle.remove();
  }, []);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      {Platform.OS !== 'web' && (
        <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      )}
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <AuthProvider>
                <WearwellProvider>
                  <RootLayoutNav />
                </WearwellProvider>
              </AuthProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
