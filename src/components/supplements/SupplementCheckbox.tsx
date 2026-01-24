import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, typography, spacing, borderRadius } from '../../theme';
import { Supplement } from '../../types';

interface SupplementCheckboxProps {
  supplement: Supplement;
  isTaken: boolean;
  onToggle: () => void;
  isFirst: boolean;
  isLast: boolean;
}

export function SupplementCheckbox({
  supplement,
  isTaken,
  onToggle,
  isFirst,
  isLast,
}: SupplementCheckboxProps) {
  return (
    <TouchableOpacity
      style={[
        styles.container,
        isFirst && styles.containerFirst,
        isLast && styles.containerLast,
        !isLast && styles.containerBorder,
      ]}
      onPress={onToggle}
      activeOpacity={0.7}
    >
      <View style={[styles.checkbox, isTaken && styles.checkboxChecked]}>
        {isTaken && <Text style={styles.checkmark}>✓</Text>}
      </View>
      <Text style={[styles.label, isTaken && styles.labelChecked]}>
        {supplement.name}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
  },
  containerFirst: {
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
  },
  containerLast: {
    borderBottomLeftRadius: borderRadius.lg,
    borderBottomRightRadius: borderRadius.lg,
  },
  containerBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: borderRadius.sm,
    borderWidth: 2,
    borderColor: colors.textTertiary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkmark: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  label: {
    fontSize: typography.size.base,
    color: colors.text,
    flex: 1,
  },
  labelChecked: {
    color: colors.textSecondary,
  },
});

export default SupplementCheckbox;
