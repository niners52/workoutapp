/**
 * Settings -> Health Targets: every number the health dashboard uses.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Crypto from 'expo-crypto';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO, startOfWeek } from 'date-fns';
import { colors, typography, spacing, borderRadius, commonStyles } from '../theme';
import { Button, Card, NumberInput } from '../components/common';
import { useData } from '../contexts/DataContext';
import {
  ALL_TRACKABLE_MUSCLE_GROUPS,
  DEFAULT_HEALTH_TARGETS,
  MUSCLE_GROUP_DISPLAY_NAMES,
  type HealthTargets,
  type MacroMode,
  type PrimaryMuscleGroup,
} from '../types';
import { calorieBand } from '../services/healthDashboard';

const GROUP_NAMES = MUSCLE_GROUP_DISPLAY_NAMES as Record<string, string>;
const PICKABLE_GROUPS = ALL_TRACKABLE_MUSCLE_GROUPS.filter(g => g !== 'miscellaneous');

interface NumberRowProps {
  label: string;
  hint?: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  decimals?: boolean;
  last?: boolean;
}

function NumberRow({ label, hint, value, onChange, min, max, step, decimals, last }: NumberRowProps) {
  return (
    <View style={[styles.row, last && styles.rowLast]}>
      <View style={styles.rowText}>
        <Text style={styles.label}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      <NumberInput value={value} onChangeValue={onChange} min={min} max={max} step={step} allowDecimals={decimals} />
    </View>
  );
}

export function HealthTargetsScreen() {
  const { userSettings, updateUserSettings } = useData();
  const t = userSettings.healthTargets ?? DEFAULT_HEALTH_TARGETS;
  const weekStartsOn = userSettings.weekStartDay === 'monday' ? 1 : 0;
  const update = (patch: Partial<HealthTargets>) => updateUserSettings({ healthTargets: { ...t, ...patch } });

  const [showAndroidPicker, setShowAndroidPicker] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newGroup, setNewGroup] = useState<PrimaryMuscleGroup>('chest');
  const [newFilter, setNewFilter] = useState('');
  const [newTarget, setNewTarget] = useState(0);

  const band = calorieBand(t);
  const deloadDate = t.deloadWeekStart ? parseISO(t.deloadWeekStart) : null;
  const setDeload = (d: Date) => update({ deloadWeekStart: format(startOfWeek(d, { weekStartsOn }), 'yyyy-MM-dd') });

  const moveFocus = (index: number, delta: number) => {
    const next = [...t.focusGroups];
    const [item] = next.splice(index, 1);
    if (!item) return;
    next.splice(index + delta, 0, item);
    update({ focusGroups: next });
  };

  const addFocus = () => {
    const label = newLabel.trim();
    if (!label) return;
    const filter = newFilter.trim();
    update({
      focusGroups: [
        ...t.focusGroups,
        {
          id: Crypto.randomUUID(),
          label,
          muscleGroup: newGroup,
          ...(filter ? { exerciseNameIncludes: filter } : {}),
          ...(newTarget > 0 ? { targetSets: newTarget } : {}),
        },
      ],
    });
    setNewLabel('');
    setNewFilter('');
    setNewTarget(0);
  };

  const resetDefaults = () =>
    Alert.alert('Reset health targets?', 'Every target on this screen goes back to its default.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: () => updateUserSettings({ healthTargets: DEFAULT_HEALTH_TARGETS }) },
    ]);

  return (
    <ScrollView style={commonStyles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.sectionTitle}>Sodium</Text>
      <Card padding="none">
        <NumberRow label="Daily budget (mg)" value={t.sodiumBudgetMg} onChange={v => update({ sodiumBudgetMg: v })} min={500} max={6000} step={100} />
        <NumberRow
          label="Warn at % remaining"
          value={t.sodiumWarnRemainingPct}
          onChange={v => update({ sodiumWarnRemainingPct: v })}
          min={5}
          max={75}
          step={5}
        />
        <NumberRow
          label="Evening starts (hour)"
          hint={`Copy switches to “left this evening” at ${t.eveningStartHour}:00`}
          value={t.eveningStartHour}
          onChange={v => update({ eveningStartHour: v })}
          min={12}
          max={23}
          step={1}
          last
        />
      </Card>

      <Text style={styles.sectionTitle}>Calcium (target band)</Text>
      <Card padding="none">
        <NumberRow label="Band low (mg)" value={t.calciumBandLowMg} onChange={v => update({ calciumBandLowMg: v })} min={200} max={t.calciumBandHighMg} step={50} />
        <NumberRow
          label="Band high (mg)"
          value={t.calciumBandHighMg}
          onChange={v => update({ calciumBandHighMg: v })}
          min={t.calciumBandLowMg}
          max={t.calciumFarAboveMg}
          step={50}
        />
        <NumberRow
          label="Flag again at (mg)"
          hint="At or above this reads amber"
          value={t.calciumFarAboveMg}
          onChange={v => update({ calciumFarAboveMg: v })}
          min={t.calciumBandHighMg}
          max={5000}
          step={100}
          last
        />
      </Card>

      <Text style={styles.sectionTitle}>Macros</Text>
      <Card padding="none">
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.label}>Mode</Text>
            <Text style={styles.hint}>
              {t.macroMode === 'cutting'
                ? `Cutting: the calorie band drops ${t.cuttingCalorieDeficit} kcal`
                : 'Maintenance: the calorie band as written'}
            </Text>
          </View>
          <View style={styles.modeToggle}>
            {(['maintenance', 'cutting'] as MacroMode[]).map(m => (
              <TouchableOpacity
                key={m}
                style={[styles.mode, t.macroMode === m && styles.modeActive]}
                onPress={() => update({ macroMode: m })}
              >
                <Text style={[styles.modeText, t.macroMode === m && styles.modeTextActive]}>
                  {m === 'maintenance' ? 'Maintain' : 'Cut'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <NumberRow
          label="Calorie band low (kcal)"
          hint={`In force now: ${band.lowKcal}–${band.highKcal} kcal`}
          value={t.calorieBandLowKcal}
          onChange={v => update({ calorieBandLowKcal: v })}
          min={1000}
          max={t.calorieBandHighKcal}
          step={50}
        />
        <NumberRow
          label="Calorie band high (kcal)"
          value={t.calorieBandHighKcal}
          onChange={v => update({ calorieBandHighKcal: v })}
          min={t.calorieBandLowKcal}
          max={6000}
          step={50}
        />
        <NumberRow
          label="Cutting deficit (kcal)"
          hint="Subtracted from both ends of the band in cutting mode"
          value={t.cuttingCalorieDeficit}
          onChange={v => update({ cuttingCalorieDeficit: v })}
          min={0}
          max={1000}
          step={50}
        />
        <NumberRow label="Fat floor (g)" value={t.fatFloorG} onChange={v => update({ fatFloorG: v })} min={20} max={200} step={5} />
        <NumberRow
          label="Fat target high (g)"
          hint="Top of the comfortable range; shown, never flagged"
          value={t.fatTargetHighG}
          onChange={v => update({ fatTargetHighG: v })}
          min={t.fatFloorG}
          max={250}
          step={5}
        />
        <NumberRow label="Carb range low (g)" value={t.carbRangeLowG} onChange={v => update({ carbRangeLowG: v })} min={0} max={t.carbRangeHighG} step={10} />
        <NumberRow
          label="Carb range high (g)"
          hint="Carbs are information only — no pass or fail"
          value={t.carbRangeHighG}
          onChange={v => update({ carbRangeHighG: v })}
          min={t.carbRangeLowG}
          max={800}
          step={10}
          last
        />
      </Card>

      <Text style={styles.sectionTitle}>Protein and logging</Text>
      <Card padding="none">
        <NumberRow label="Protein floor (g)" value={t.proteinFloorG} onChange={v => update({ proteinFloorG: v })} min={50} max={400} step={5} />
        <NumberRow
          label="Check evening logging after (hour)"
          hint={`Flags a day with nothing logged after ${t.eveningStartHour}:00`}
          value={t.eveningLogCheckHour}
          onChange={v => update({ eveningLogCheckHour: v })}
          min={t.eveningStartHour}
          max={23}
          step={1}
          last
        />
      </Card>

      <Text style={styles.sectionTitle}>Body weight and sleep</Text>
      <Card padding="none">
        <NumberRow label="Goal weight (lb)" value={t.goalWeightLbs} onChange={v => update({ goalWeightLbs: v })} min={80} max={400} step={0.5} decimals />
        <NumberRow
          label="Maintenance within (lb)"
          value={t.goalWeightToleranceLbs}
          onChange={v => update({ goalWeightToleranceLbs: v })}
          min={0.5}
          max={10}
          step={0.5}
          decimals
        />
        <NumberRow
          label="Weigh-in stale after (days)"
          value={t.weighInStaleDays}
          onChange={v => update({ weighInStaleDays: v })}
          min={1}
          max={14}
          step={1}
        />
        <NumberRow
          label="Sleep target (hours)"
          value={t.sleepTargetHours}
          onChange={v => update({ sleepTargetHours: v })}
          min={4}
          max={12}
          step={0.5}
          decimals
          last
        />
      </Card>

      <Text style={styles.sectionTitle}>Deload week</Text>
      <Card padding="none">
        <View style={[styles.row, !deloadDate && styles.rowLast]}>
          <View style={styles.rowText}>
            <Text style={styles.label}>{deloadDate ? `Week of ${format(startOfWeek(deloadDate, { weekStartsOn }), 'MMM d, yyyy')}` : 'None scheduled'}</Text>
            <Text style={styles.hint}>Banner on Home; urgency colors suspended that week</Text>
          </View>
          {Platform.OS === 'ios' ? (
            <DateTimePicker
              value={deloadDate ?? new Date()}
              mode="date"
              display="compact"
              themeVariant="dark"
              onChange={(_, d) => d && setDeload(d)}
            />
          ) : (
            <Button title="Pick" size="small" variant="secondary" onPress={() => setShowAndroidPicker(true)} />
          )}
        </View>
        {showAndroidPicker && (
          <DateTimePicker
            value={deloadDate ?? new Date()}
            mode="date"
            onChange={(_, d) => {
              setShowAndroidPicker(false);
              if (d) setDeload(d);
            }}
          />
        )}
        {deloadDate && (
          <TouchableOpacity style={[styles.row, styles.rowLast]} onPress={() => update({ deloadWeekStart: null })}>
            <Text style={styles.destructive}>Clear deload week</Text>
          </TouchableOpacity>
        )}
      </Card>

      <Text style={styles.sectionTitle}>Focus groups</Text>
      <Card padding="none">
        {t.focusGroups.length === 0 && <Text style={[styles.hint, styles.padded]}>No focus groups. Add one below.</Text>}
        {t.focusGroups.map((f, i) => (
          <View key={f.id} style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.label}>{f.label}</Text>
              <Text style={styles.hint}>
                {[
                  GROUP_NAMES[f.muscleGroup] ?? f.muscleGroup,
                  f.exerciseNameIncludes ? `exercises containing “${f.exerciseNameIncludes}”` : null,
                  f.targetSets ? `target ${f.targetSets}` : f.exerciseNameIncludes ? 'no target' : 'group target',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
            <TouchableOpacity disabled={i === 0} onPress={() => moveFocus(i, -1)} style={styles.iconButton} accessibilityLabel={`Move ${f.label} up`}>
              <Ionicons name="arrow-up" size={20} color={i === 0 ? colors.textTertiary : colors.text} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => update({ focusGroups: t.focusGroups.filter(g => g.id !== f.id) })}
              style={styles.iconButton}
              accessibilityLabel={`Remove ${f.label}`}
            >
              <Ionicons name="close-circle-outline" size={22} color={colors.error} />
            </TouchableOpacity>
          </View>
        ))}
        <View style={[styles.padded, styles.addForm]}>
          <Text style={styles.label}>Add focus group</Text>
          <TextInput
            style={[commonStyles.input, styles.input]}
            placeholder="Label, e.g. Upper chest (incline pressing)"
            placeholderTextColor={colors.textTertiary}
            value={newLabel}
            onChangeText={setNewLabel}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips}>
            {PICKABLE_GROUPS.map(g => (
              <TouchableOpacity key={g} onPress={() => setNewGroup(g)} style={[styles.chip, newGroup === g && styles.chipSelected]}>
                <Text style={[styles.chipText, newGroup === g && styles.chipTextSelected]}>{GROUP_NAMES[g] ?? g}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TextInput
            style={[commonStyles.input, styles.input]}
            placeholder="Only exercises containing… (optional)"
            placeholderTextColor={colors.textTertiary}
            value={newFilter}
            onChangeText={setNewFilter}
            autoCapitalize="none"
          />
          <View style={[styles.row, styles.rowLast, styles.noPadding]}>
            <View style={styles.rowText}>
              <Text style={styles.label}>Weekly target</Text>
              <Text style={styles.hint}>0 = use the group’s target</Text>
            </View>
            <NumberInput value={newTarget} onChangeValue={setNewTarget} min={0} max={40} step={1} />
          </View>
          <Button title="Add focus group" onPress={addFocus} disabled={!newLabel.trim()} variant="secondary" />
        </View>
      </Card>

      <Button title="Reset to defaults" onPress={resetDefaults} variant="ghost" style={styles.reset} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.base,
    paddingBottom: spacing.xxxl,
  },
  sectionTitle: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  noPadding: {
    paddingHorizontal: 0,
  },
  rowText: {
    flex: 1,
    marginRight: spacing.sm,
  },
  label: {
    fontSize: typography.size.base,
    color: colors.text,
  },
  hint: {
    fontSize: typography.size.xs,
    color: colors.textTertiary,
    marginTop: 2,
  },
  modeToggle: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  mode: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.backgroundTertiary,
  },
  modeActive: {
    backgroundColor: colors.primary,
  },
  modeText: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.textSecondary,
  },
  modeTextActive: {
    color: colors.background,
  },
  padded: {
    padding: spacing.base,
  },
  destructive: {
    fontSize: typography.size.base,
    color: colors.error,
  },
  iconButton: {
    padding: spacing.xs,
    marginLeft: spacing.xs,
  },
  addForm: {
    gap: spacing.sm,
  },
  input: {
    fontSize: typography.size.base,
  },
  chips: {
    flexGrow: 0,
  },
  chip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    backgroundColor: colors.backgroundTertiary,
    marginRight: spacing.xs,
  },
  chipSelected: {
    backgroundColor: colors.primary,
  },
  chipText: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  chipTextSelected: {
    color: colors.textOnPrimary,
    fontWeight: typography.weight.semibold,
  },
  reset: {
    marginTop: spacing.xl,
  },
});

export default HealthTargetsScreen;
