import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, borderRadius } from '../../theme';

interface MissingSleepPromptProps {
  visible: boolean;
  onDismiss: () => void;
  onSave: (hours: number, isEstimate: boolean) => void;
  averageSleepHours: number | null;
}

const QUICK_HOURS = [5, 6, 7, 8, 9];

export function MissingSleepPrompt({
  visible,
  onDismiss,
  onSave,
  averageSleepHours,
}: MissingSleepPromptProps) {
  const [customHours, setCustomHours] = useState('');

  const handleQuickHour = (hours: number) => {
    onSave(hours, false);
  };

  const handleCustomSave = () => {
    const parsed = parseFloat(customHours);
    if (isNaN(parsed) || parsed < 0.5 || parsed > 16) return;
    onSave(Math.round(parsed * 10) / 10, false);
    setCustomHours('');
  };

  const handleUseAverage = () => {
    if (averageSleepHours !== null) {
      onSave(averageSleepHours, true);
    }
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onDismiss}
    >
      <SafeAreaView style={styles.container} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onDismiss} style={styles.closeButton}>
            <Ionicons name="close" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>No Sleep Data</Text>
          <View style={styles.closeButton} />
        </View>

        <KeyboardAvoidingView
          style={styles.content}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* Icon + Description */}
          <View style={styles.iconSection}>
            <Ionicons name="moon-outline" size={48} color={colors.chartSleep} />
            <Text style={styles.description}>
              No sleep data from last night. Log it manually?
            </Text>
          </View>

          {/* Quick Hour Buttons */}
          <Text style={styles.sectionLabel}>Quick entry</Text>
          <View style={styles.quickRow}>
            {QUICK_HOURS.map((hours) => (
              <TouchableOpacity
                key={hours}
                style={styles.quickButton}
                onPress={() => handleQuickHour(hours)}
                activeOpacity={0.7}
              >
                <Text style={styles.quickButtonText}>{hours}h</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Custom Input */}
          <Text style={styles.sectionLabel}>Custom</Text>
          <View style={styles.customRow}>
            <TextInput
              style={styles.customInput}
              value={customHours}
              onChangeText={setCustomHours}
              placeholder="e.g. 6.5"
              placeholderTextColor={colors.textTertiary}
              keyboardType="decimal-pad"
              returnKeyType="done"
              onSubmitEditing={handleCustomSave}
            />
            <Text style={styles.customUnit}>hrs</Text>
            <TouchableOpacity
              style={[
                styles.customSaveButton,
                (!customHours || isNaN(parseFloat(customHours)) || parseFloat(customHours) < 0.5 || parseFloat(customHours) > 16) && styles.customSaveButtonDisabled,
              ]}
              onPress={handleCustomSave}
              disabled={!customHours || isNaN(parseFloat(customHours)) || parseFloat(customHours) < 0.5 || parseFloat(customHours) > 16}
              activeOpacity={0.7}
            >
              <Text style={styles.customSaveButtonText}>Save</Text>
            </TouchableOpacity>
          </View>

          {/* Divider */}
          <View style={styles.divider} />

          {/* Use Average Button */}
          {averageSleepHours !== null && (
            <TouchableOpacity
              style={styles.averageButton}
              onPress={handleUseAverage}
              activeOpacity={0.7}
            >
              <Ionicons name="analytics-outline" size={20} color={colors.primary} />
              <Text style={styles.averageButtonText}>
                Use my average ({averageSleepHours} hrs)
              </Text>
            </TouchableOpacity>
          )}

          {/* Divider */}
          <View style={styles.divider} />

          {/* Skip */}
          <TouchableOpacity
            style={styles.skipButton}
            onPress={onDismiss}
            activeOpacity={0.7}
          >
            <Text style={styles.skipButtonText}>Skip for today</Text>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.text,
  },
  content: {
    flex: 1,
    padding: spacing.base,
  },
  iconSection: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  description: {
    fontSize: typography.size.base,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.md,
    lineHeight: typography.size.base * typography.lineHeight.relaxed,
  },
  sectionLabel: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  quickRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  quickButton: {
    flex: 1,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickButtonText: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.text,
  },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  customInput: {
    flex: 1,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: typography.size.base,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  customUnit: {
    fontSize: typography.size.base,
    color: colors.textSecondary,
  },
  customSaveButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  customSaveButtonDisabled: {
    opacity: 0.4,
  },
  customSaveButtonText: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: colors.textOnPrimary,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.separator,
    marginVertical: spacing.lg,
  },
  averageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.primary + '40',
  },
  averageButtonText: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: colors.primary,
  },
  skipButton: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  skipButtonText: {
    fontSize: typography.size.base,
    color: colors.textTertiary,
  },
});

export default MissingSleepPrompt;
