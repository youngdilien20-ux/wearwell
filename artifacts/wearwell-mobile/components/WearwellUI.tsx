import React, { ReactNode } from 'react';
import {
  Platform,
  Pressable,
  PressableProps,
  StyleProp,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
  useColorScheme,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';

type Children = { children: ReactNode; scrollViewRef?: React.Ref<any> };

export function ScreenScroll({ children, scrollViewRef }: Children) {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === 'web' ? Math.max(67, insets.top) : 0;
  const safeAreaBackground =
    Platform.OS !== 'web' && colorScheme !== 'dark' ? colors.sage : colors.background;
  return (
    <SafeAreaView
      edges={Platform.OS === 'web' ? ['left', 'right'] : ['top', 'left', 'right']}
      style={{ flex: 1, backgroundColor: safeAreaBackground }}
    >
      <KeyboardAwareScrollViewCompat
        ref={scrollViewRef}
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{
          flexGrow: 1,
          width: '100%',
          alignItems: 'center',
          paddingHorizontal: 20,
          paddingTop: 13 + webTopInset,
          paddingBottom: Math.max(112, insets.bottom + 96),
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        bottomOffset={24}
      >
        <View style={{ width: '100%', maxWidth: 620, gap: 17 }}>{children}</View>
      </KeyboardAwareScrollViewCompat>
    </SafeAreaView>
  );
}

export function BrandHeader({ caption = 'YOUR PERSONAL WARDROBE' }: { caption?: string }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 5 }}>
      <View
        style={{
          width: 39,
          height: 39,
          borderRadius: 13,
          borderBottomLeftRadius: 5,
          backgroundColor: colors.plum,
          alignItems: 'center',
          justifyContent: 'center',
          transform: [{ rotate: '-5deg' }],
        }}
      >
        <Text style={{ color: colors.lime, fontFamily: 'Georgia', fontSize: 25, fontWeight: '700' }}>
          W
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            color: colors.foreground,
            fontFamily: 'Inter_700Bold',
            fontSize: 18,
            letterSpacing: -0.7,
          }}
        >
          wearwell
        </Text>
        <Text
          style={{
            marginTop: 2,
            color: colors.mutedForeground,
            fontFamily: 'Inter_500Medium',
            fontSize: 9,
            letterSpacing: 1.1,
          }}
        >
          {caption}
        </Text>
      </View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          paddingHorizontal: 9,
          paddingVertical: 7,
          borderRadius: 20,
          backgroundColor: colors.muted,
        }}
      >
        <Feather name="smartphone" size={12} color={colors.mutedForeground} />
        <Text style={{ color: colors.mutedForeground, fontSize: 9, fontFamily: 'Inter_600SemiBold' }}>
          ON DEVICE
        </Text>
      </View>
    </View>
  );
}

export function Eyebrow({ children }: Children) {
  const colors = useColors();
  return (
    <Text
      style={{
        color: colors.mutedForeground,
        fontFamily: 'Inter_600SemiBold',
        fontSize: 10,
        letterSpacing: 1.4,
        textTransform: 'uppercase',
      }}
    >
      {children}
    </Text>
  );
}

export function PageTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  const colors = useColors();
  return (
    <View style={{ gap: 6 }}>
      <Text
        accessibilityRole="header"
        style={{
          color: colors.foreground,
          fontFamily: 'Georgia',
          fontSize: 30,
          lineHeight: 37,
          letterSpacing: -0.7,
        }}
      >
        {title}
      </Text>
      {subtitle ? (
        <Text style={{ color: colors.mutedForeground, fontSize: 14, lineHeight: 21 }}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

export function SectionTitle({
  title,
  detail,
  trailing,
}: {
  title: string;
  detail?: string;
  trailing?: ReactNode;
}) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}>
      <View style={{ flex: 1, gap: 4 }}>
        <Text
          accessibilityRole="header"
          style={{
            color: colors.foreground,
            fontFamily: 'Inter_700Bold',
            fontSize: 16,
            letterSpacing: -0.3,
          }}
        >
          {title}
        </Text>
        {detail ? (
          <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18 }}>
            {detail}
          </Text>
        ) : null}
      </View>
      {trailing}
    </View>
  );
}

export function Card({
  children,
  style,
}: Children & { style?: StyleProp<ViewStyle> }) {
  const colors = useColors();
  return (
    <View
      style={[
        {
          padding: 16,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 16,
          backgroundColor: colors.card,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

type ButtonProps = PressableProps & {
  label: string;
  icon?: keyof typeof Feather.glyphMap;
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'quiet';
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function ActionButton({
  label,
  icon,
  variant = 'primary',
  compact = false,
  style,
  disabled,
  ...props
}: ButtonProps) {
  const colors = useColors();
  const palettes = {
    primary: { background: colors.primary, foreground: colors.primaryForeground, border: colors.primary },
    secondary: { background: colors.secondary, foreground: colors.secondaryForeground, border: colors.secondary },
    outline: { background: colors.card, foreground: colors.foreground, border: colors.border },
    danger: { background: colors.destructive, foreground: colors.destructiveForeground, border: colors.destructive },
    quiet: { background: 'transparent', foreground: colors.plum, border: 'transparent' },
  };
  const palette = palettes[variant];
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      style={({ pressed }) => [
        {
          minHeight: compact ? 38 : 48,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          paddingHorizontal: compact ? 12 : 16,
          paddingVertical: compact ? 7 : 11,
          borderWidth: 1,
          borderColor: palette.border,
          borderRadius: 12,
          backgroundColor: palette.background,
          opacity: disabled ? 0.5 : pressed ? 0.82 : 1,
        },
        style,
      ]}
      {...props}
    >
      {icon ? <Feather name={icon} size={compact ? 14 : 16} color={palette.foreground} /> : null}
      <Text
        style={{
          color: palette.foreground,
          fontFamily: 'Inter_600SemiBold',
          fontSize: compact ? 12 : 14,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function ChoiceChip({
  label,
  selected,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 38,
        justifyContent: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: selected ? colors.plum : colors.border,
        backgroundColor: selected ? colors.sage : colors.card,
        opacity: pressed ? 0.75 : 1,
      })}
    >
      <Text
        style={{
          color: selected ? colors.plum : colors.mutedForeground,
          fontFamily: selected ? 'Inter_600SemiBold' : 'Inter_500Medium',
          fontSize: 12,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function TextField({
  label,
  hint,
  inputStyle,
  ...props
}: TextInputProps & { label: string; hint?: string; inputStyle?: StyleProp<TextStyle> }) {
  const colors = useColors();
  return (
    <View style={{ gap: 7 }}>
      <Text style={{ color: colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>
        {label}
      </Text>
      <TextInput
        placeholderTextColor={colors.mutedForeground}
        selectionColor={colors.plum}
        style={[
          {
            minHeight: 48,
            paddingHorizontal: 13,
            paddingVertical: 11,
            borderWidth: 1,
            borderColor: colors.input,
            borderRadius: 11,
            backgroundColor: colors.background,
            color: colors.foreground,
            fontFamily: 'Inter_400Regular',
            fontSize: 14,
          },
          inputStyle,
        ]}
        {...props}
      />
      {hint ? (
        <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16 }}>{hint}</Text>
      ) : null}
    </View>
  );
}

export function InlineNotice({
  children,
  tone = 'info',
}: Children & { tone?: 'info' | 'error' | 'success' }) {
  const colors = useColors();
  const toneColor =
    tone === 'error' ? colors.destructive : tone === 'success' ? colors.secondaryForeground : colors.mutedForeground;
  const background = tone === 'success' ? colors.sage : colors.muted;
  return (
    <View
      accessibilityRole={tone === 'error' ? 'alert' : undefined}
      style={{ padding: 12, borderRadius: 11, backgroundColor: background }}
    >
      <Text style={{ color: toneColor, fontSize: 12, lineHeight: 18 }}>{children}</Text>
    </View>
  );
}

export function Hairline() {
  const colors = useColors();
  return <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 2 }} />;
}