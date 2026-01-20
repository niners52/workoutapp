import React, { useState, useEffect } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, typography, spacing, borderRadius } from '../../theme';

interface NumberInputProps {
  value: number;
  onChangeValue: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  suffix?: string;
  style?: ViewStyle;
  allowDecimals?: boolean;
}

export function NumberInput({
  value,
  onChangeValue,
  min = 0,
  max = 9999,
  step = 1,
  label,
  suffix,
  style,
  allowDecimals = false,
}: NumberInputProps) {
  const [textValue, setTextValue] = useState(value.toString());

  useEffect(() => {
    setTextValue(value.toString());
  }, [value]);

  const handleTextChange = (text: string) => {
    // Allow empty string for clearing
    if (text === '') {
      setTextValue('');
      return;
    }

    // Validate input
    const regex = allowDecimals ? /^-?\d*\.?\d*$/ : /^-?\d*$/;
    if (!regex.test(text)) return;

    setTextValue(text);

    const numValue = allowDecimals ? parseFloat(text) : parseInt(text, 10);
    if (!isNaN(numValue)) {
      const clampedValue = Math.min(Math.max(numValue, min), max);
      onChangeValue(clampedValue);
    }
  };

  const handleBlur = () => {
    // Reset to current value if input is empty or invalid
    if (textValue === '' || isNaN(parseFloat(textValue))) {
      setTextValue(value.toString());
    }
  };

  const increment = () => {
    const newValue = Math.min(value + step, max);
    onChangeValue(newValue);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const decrement = () => {
    const newValue = Math.max(value - step, min);
    onChangeValue(newValue);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  return (
    <View style={[styles.container, style]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={styles.inputRow}>
        <TouchableOpacity
          style={styles.button}
          onPress={decrement}
          disabled={value <= min}
        >
          <Text style={[styles.buttonText, value <= min && styles.disabled]}>−</Text>
        </TouchableOpacity>

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={textValue}
            onChangeText={handleTextChange}
            onBlur={handleBlur}
            keyboardType="numeric"
            selectTextOnFocus
            textAlign="center"
          />
          {suffix && <Text style={styles.suffix}>{suffix}</Text>}
        </View>

        <TouchableOpacity
          style={styles.button}
          onPress={increment}
          disabled={value >= max}
        >
          <Text style={[styles.buttonText, value >= max && styles.disabled]}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  label: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  button: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
    backgroundColor: colors.backgroundTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: typography.size.xl,
    color: colors.primary,
    fontWeight: typography.weight.medium,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.sm,
  },
  input: {
    backgroundColor: colors.backgroundTertiary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    fontSize: typography.size.xl,
    fontWeight: typography.weight.semibold,
    color: colors.text,
    minWidth: 80,
    textAlign: 'center',
  },
  suffix: {
    fontSize: typography.size.md,
    color: colors.textSecondary,
    marginLeft: spacing.xs,
  },
  disabled: {
    opacity: 0.3,
  },
});

export default NumberInput;
