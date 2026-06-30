import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, typography, spacing, borderRadius, commonStyles } from '../theme';
import { Card } from '../components/common';
import { useData } from '../contexts/DataContext';
import { logAerobicSession } from '../services/modalityActions';
import { RootStackParamList } from '../navigation/types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type AerobicRouteProp = RouteProp<RootStackParamList, 'AerobicSession'>;

/**
 * Logger for aerobic sessions (Tue/Fri/Sat in the MS preset, or any aerobic day
 * in a custom Program). Built-in timer auto-fills the duration field; HR /
 * distance / calories can be entered manually here and will be replaced by
 * HealthKit auto-fill once that's wired up (section 4).
 */
export function AerobicSessionScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<AerobicRouteProp>();
  const targetDurationMin = route.params?.targetDurationMin;
  const targetIntensityRPE = route.params?.targetIntensityRPE;
  const targetHRPctMax = route.params?.targetHRPctMax;
  const dayNotes = route.params?.notes;
  const { refreshWorkouts } = useData();

  // Inline stopwatch — keeps the live "elapsed" display in sync with the timer ref.
  const startedAtRef = useRef<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [running, setRunning] = useState(false);

  // Manual inputs (saved alongside timer-derived duration)
  const [durationOverride, setDurationOverride] = useState<string>('');
  const [rpe, setRpe] = useState<number | null>(null);
  const [avgHR, setAvgHR] = useState('');
  const [maxHR, setMaxHR] = useState('');
  const [distance, setDistance] = useState('');
  const [activeEnergy, setActiveEnergy] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!running) return;
    const tick = setInterval(() => {
      if (startedAtRef.current) {
        setElapsedSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [running]);

  const handleStart = () => {
    if (startedAtRef.current === null) {
      startedAtRef.current = Date.now();
    } else {
      // Resume from pause — shift start so accumulated elapsed stays the same
      startedAtRef.current = Date.now() - elapsedSeconds * 1000;
    }
    setRunning(true);
  };

  const handlePause = () => {
    setRunning(false);
  };

  const handleReset = () => {
    setRunning(false);
    startedAtRef.current = null;
    setElapsedSeconds(0);
  };

  const formatElapsed = (secs: number): string => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // Use timer's elapsed if no override, otherwise parse override (allows manual entry)
  const resolveDurationMin = (): number => {
    const override = parseFloat(durationOverride);
    if (!Number.isNaN(override) && override > 0) return override;
    return Math.round((elapsedSeconds / 60) * 10) / 10; // 1 decimal place
  };

  const handleSave = async () => {
    const durationMin = resolveDurationMin();
    if (!(durationMin > 0)) {
      Alert.alert('Duration required', 'Run the timer or type a duration before saving.');
      return;
    }
    setSaving(true);
    try {
      await logAerobicSession({
        durationMin,
        intensityRPE: rpe ?? undefined,
        avgHR: avgHR ? parseInt(avgHR, 10) : undefined,
        maxHR: maxHR ? parseInt(maxHR, 10) : undefined,
        distance: distance ? parseFloat(distance) : undefined,
        activeEnergy: activeEnergy ? parseInt(activeEnergy, 10) : undefined,
      });
      await refreshWorkouts();
      navigation.goBack();
    } catch (err: any) {
      Alert.alert('Save failed', err?.message ?? 'Could not save the session.');
    } finally {
      setSaving(false);
    }
  };

  // Borg modified scale chips (6-20 is the classic Borg; 1-10 is the modified.
  // The brief uses 11-13 as a target so we present the 11-20 range that maps to
  // light-through-hard. Anything outside still typeable into a number field below.)
  const RPE_OPTIONS = [9, 10, 11, 12, 13, 14, 15, 16, 17];

  const targetText = (() => {
    const bits: string[] = [];
    if (targetDurationMin) bits.push(`${targetDurationMin} min`);
    if (targetIntensityRPE) bits.push(`RPE ${targetIntensityRPE}`);
    if (targetHRPctMax) bits.push(`${targetHRPctMax}% HRmax`);
    return bits.join(' · ');
  })();

  return (
    <SafeAreaView style={commonStyles.safeArea} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.cancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Aerobic Session</Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Target from routine */}
          {targetText && (
            <Card style={styles.targetCard}>
              <Text style={styles.targetLabel}>Today's Target</Text>
              <Text style={styles.targetValue}>{targetText}</Text>
              {dayNotes ? <Text style={styles.targetNotes}>{dayNotes}</Text> : null}
            </Card>
          )}

          {/* Timer */}
          <Card style={styles.timerCard}>
            <Text style={styles.timerValue}>{formatElapsed(elapsedSeconds)}</Text>
            <View style={styles.timerActions}>
              {!running ? (
                <TouchableOpacity style={styles.timerPrimary} onPress={handleStart}>
                  <Text style={styles.timerPrimaryText}>
                    {elapsedSeconds === 0 ? 'Start' : 'Resume'}
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.timerPrimary} onPress={handlePause}>
                  <Text style={styles.timerPrimaryText}>Pause</Text>
                </TouchableOpacity>
              )}
              {elapsedSeconds > 0 && (
                <TouchableOpacity style={styles.timerSecondary} onPress={handleReset}>
                  <Text style={styles.timerSecondaryText}>Reset</Text>
                </TouchableOpacity>
              )}
            </View>
          </Card>

          {/* Duration (auto-filled from timer, editable) */}
          <Text style={styles.fieldLabel}>Duration (min)</Text>
          <TextInput
            style={styles.input}
            keyboardType="decimal-pad"
            value={durationOverride}
            onChangeText={setDurationOverride}
            placeholder={`${(elapsedSeconds / 60).toFixed(1)} (from timer)`}
            placeholderTextColor={colors.textTertiary}
          />

          {/* RPE picker */}
          <Text style={styles.fieldLabel}>RPE (Borg)</Text>
          <View style={styles.chipRow}>
            {RPE_OPTIONS.map(n => {
              const selected = rpe === n;
              return (
                <TouchableOpacity
                  key={n}
                  style={[styles.chip, selected && styles.chipSelected]}
                  onPress={() => setRpe(selected ? null : n)}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{n}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Optional cardio fields */}
          <Text style={styles.sectionLabel}>Optional</Text>
          <View style={styles.row}>
            <View style={styles.col}>
              <Text style={styles.fieldLabel}>Avg HR (bpm)</Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                value={avgHR}
                onChangeText={setAvgHR}
                placeholder="—"
                placeholderTextColor={colors.textTertiary}
              />
            </View>
            <View style={styles.col}>
              <Text style={styles.fieldLabel}>Max HR (bpm)</Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                value={maxHR}
                onChangeText={setMaxHR}
                placeholder="—"
                placeholderTextColor={colors.textTertiary}
              />
            </View>
          </View>
          <View style={styles.row}>
            <View style={styles.col}>
              <Text style={styles.fieldLabel}>Distance (mi)</Text>
              <TextInput
                style={styles.input}
                keyboardType="decimal-pad"
                value={distance}
                onChangeText={setDistance}
                placeholder="—"
                placeholderTextColor={colors.textTertiary}
              />
            </View>
            <View style={styles.col}>
              <Text style={styles.fieldLabel}>Calories</Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                value={activeEnergy}
                onChangeText={setActiveEnergy}
                placeholder="—"
                placeholderTextColor={colors.textTertiary}
              />
            </View>
          </View>

          <TouchableOpacity
            style={[styles.saveButton, saving && styles.saveDisabled]}
            onPress={handleSave}
            disabled={saving}
          >
            <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save Session'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.backgroundTertiary,
  },
  cancel: { color: colors.textSecondary, fontSize: typography.size.md },
  title: { color: colors.text, fontSize: typography.size.lg, fontWeight: typography.weight.semibold },
  placeholder: { width: 50 },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.base, paddingBottom: spacing.xxl },
  targetCard: { marginBottom: spacing.md },
  targetLabel: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  targetValue: {
    color: colors.text,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    marginTop: spacing.xs,
  },
  targetNotes: { color: colors.textSecondary, fontSize: typography.size.sm, marginTop: spacing.xs },
  timerCard: { marginBottom: spacing.lg, alignItems: 'center', paddingVertical: spacing.lg },
  timerValue: {
    color: colors.primary,
    fontSize: 56,
    fontWeight: typography.weight.bold,
    fontVariant: ['tabular-nums'],
  },
  timerActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  timerPrimary: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  timerPrimaryText: {
    color: colors.textOnPrimary,
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
  },
  timerSecondary: {
    backgroundColor: colors.backgroundTertiary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  timerSecondaryText: { color: colors.text, fontSize: typography.size.md },
  fieldLabel: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  sectionLabel: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
    fontWeight: typography.weight.semibold,
  },
  input: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text,
    fontSize: typography.size.md,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.backgroundTertiary,
    borderRadius: borderRadius.md,
    minWidth: 44,
    alignItems: 'center',
  },
  chipSelected: { backgroundColor: colors.primary },
  chipText: { color: colors.textSecondary, fontSize: typography.size.sm },
  chipTextSelected: { color: colors.textOnPrimary, fontWeight: typography.weight.semibold },
  row: { flexDirection: 'row', gap: spacing.md },
  col: { flex: 1 },
  saveButton: {
    marginTop: spacing.xl,
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  saveDisabled: { opacity: 0.6 },
  saveText: {
    color: colors.textOnPrimary,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
  },
});

export default AerobicSessionScreen;
