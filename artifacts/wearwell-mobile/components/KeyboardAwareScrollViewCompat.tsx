import { forwardRef } from 'react';
import { Platform, ScrollView, ScrollViewProps } from 'react-native';
import {
  KeyboardAwareScrollView,
  KeyboardAwareScrollViewProps,
} from 'react-native-keyboard-controller';

type Props = KeyboardAwareScrollViewProps & ScrollViewProps;

export const KeyboardAwareScrollViewCompat = forwardRef<any, Props>(
  function KeyboardAwareScrollViewCompat({
    children,
    keyboardShouldPersistTaps = 'handled',
    ...props
  }, ref) {
    if (Platform.OS === 'web') {
      return (
        <ScrollView
          ref={ref as any}
          keyboardShouldPersistTaps={keyboardShouldPersistTaps}
          {...props}
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      );
    }
    return (
      <KeyboardAwareScrollView
        ref={ref as any}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        {...props}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
      >
        {children}
      </KeyboardAwareScrollView>
    );
  },
);
