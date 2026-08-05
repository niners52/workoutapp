import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  FlatList,
  ScrollView,
} from 'react-native';
import * as Crypto from 'expo-crypto';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, borderRadius, commonStyles } from '../theme';
import { SearchBar } from '../components/common';
import { useData } from '../contexts/DataContext';
import {
  Exercise,
  Template,
  Routine,
  RoutineDaySchedule,
  PrimaryMuscleGroup,
  MUSCLE_GROUP_DISPLAY_NAMES,
  DAY_NAMES,
  DAY_NAMES_SHORT,
} from '../types';
import { RootStackParamList } from '../navigation/types';
import { matchesAllWords } from '../utils/search';
import { chooseTemplateType } from '../services/routineImport';

const generateId = () => Crypto.randomUUID();

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

type BuilderStep = 'setup' | 'build' | 'review';

// Same flat-list shape as RoutineEditorScreen: day headers interleaved with
// draggable exercise rows. Dragging past a header moves the exercise to that day.
type BuilderItem =
  | { kind: 'header'; key: string; day: number }
  | { kind: 'exercise'; key: string; day: number; exerciseId: string };

interface TargetChoice {
  sets: number;
  reps: string;
}

export function RoutineBuilderScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { exercises, locations, routines, userSettings, addTemplate, addRoutine, updateExercise } = useData();

  const defaultSets = userSettings?.defaultTargetSets ?? 3;

  const [step, setStep] = useState<BuilderStep>('setup');

  // ── Step 1 state ────────────────────────────────────────────────────────
  const [name, setName] = useState('');
  // day (0=Sun..6=Sat) → training day?
  const [trainingDays, setTrainingDays] = useState<Set<number>>(new Set([1, 2, 4, 5])); // Mon/Tue/Thu/Fri default
  // day → locationId (only meaningful for training days)
  const [dayLocations, setDayLocations] = useState<Record<number, string>>({});

  const defaultLocationId = locations[0]?.id ?? 'gym';

  const toggleTrainingDay = (day: number) => {
    setTrainingDays(prev => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  };

  // ── Step 2 state ────────────────────────────────────────────────────────
  const [items, setItems] = useState<BuilderItem[]>([]);
  // exerciseId → chosen sets/reps for this routine (applied to Exercise on save)
  const [targets, setTargets] = useState<Record<string, TargetChoice>>({});
  const [pickerForDay, setPickerForDay] = useState<number | null>(null);
  const [pickerSearch, setPickerSearch] = useState('');
  const [editingTargets, setEditingTargets] = useState<string | null>(null); // exerciseId
  const [editSets, setEditSets] = useState(3);
  const [editReps, setEditReps] = useState('10');
  const [saving, setSaving] = useState(false);

  const exerciseById = useMemo(() => new Map(exercises.map(e => [e.id, e])), [exercises]);

  const effectiveDefaultFor = (ex: Exercise | undefined): number =>
    ex?.isUnilateral ? defaultSets * 2 : defaultSets;

  // Entering the build step (re)seeds headers for the chosen training days while
  // keeping any exercises already placed on days that remain enabled.
  const enterBuildStep = () => {
    const sortedDays = [...trainingDays].sort((a, b) => a - b);
    setItems(prev => {
      const keptByDay = new Map<number, BuilderItem[]>();
      for (const item of prev) {
        if (item.kind === 'exercise' && trainingDays.has(item.day)) {
          const arr = keptByDay.get(item.day) ?? [];
          arr.push(item);
          keptByDay.set(item.day, arr);
        }
      }
      const next: BuilderItem[] = [];
      for (const day of sortedDays) {
        next.push({ kind: 'header', key: `h-${day}`, day });
        next.push(...(keptByDay.get(day) ?? []));
      }
      return next;
    });
    setStep('build');
  };

  // Guard against accidental back-swipe losing the draft
  useEffect(() => {
    const dirty = items.some(i => i.kind === 'exercise') || name.trim().length > 0;
    const unsub = navigation.addListener('beforeRemove', (e) => {
      if (!dirty || saving) return;
      e.preventDefault();
      Alert.alert('Discard routine draft?', 'Your unsaved routine will be lost.', [
        { text: 'Keep Editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
      ]);
    });
    return unsub;
  }, [navigation, items, name, saving]);

  const handleDragEnd = ({ data }: { data: BuilderItem[] }) => {
    const firstHeaderIdx = data.findIndex(i => i.kind === 'header');
    if (firstHeaderIdx > 0) {
      const strays = data.slice(0, firstHeaderIdx);
      data = [...data.slice(firstHeaderIdx, firstHeaderIdx + 1), ...strays, ...data.slice(firstHeaderIdx + 1)];
    }
    let currentDay = -1;
    setItems(data.map(item => {
      if (item.kind === 'header') {
        currentDay = item.day;
        return item;
      }
      return { ...item, day: currentDay };
    }));
  };

  const handleAddExercise = (exercise: Exercise) => {
    if (pickerForDay === null) return;
    setItems(prev => {
      const result = [...prev];
      let insertAt = result.length;
      let inDay = false;
      for (let i = 0; i < result.length; i++) {
        const it = result[i];
        if (it.kind === 'header') {
          if (inDay) { insertAt = i; break; }
          if (it.day === pickerForDay) inDay = true;
        }
      }
      result.splice(insertAt, 0, {
        kind: 'exercise',
        key: `e-${pickerForDay}-${exercise.id}-${Date.now()}`,
        day: pickerForDay,
        exerciseId: exercise.id,
      });
      return result;
    });
    // Seed default targets on first placement
    setTargets(prev => prev[exercise.id] ? prev : {
      ...prev,
      [exercise.id]: {
        sets: exercise.targetSets ?? effectiveDefaultFor(exercise),
        reps: exercise.targetReps ?? '10',
      },
    });
    setPickerForDay(null);
    setPickerSearch('');
  };

  const openTargetEditor = (exerciseId: string) => {
    const ex = exerciseById.get(exerciseId);
    const t = targets[exerciseId];
    setEditSets(t?.sets ?? ex?.targetSets ?? effectiveDefaultFor(ex));
    setEditReps(t?.reps ?? ex?.targetReps ?? '10');
    setEditingTargets(exerciseId);
  };

  const saveTargetEditor = () => {
    if (!editingTargets) return;
    setTargets(prev => ({
      ...prev,
      [editingTargets]: { sets: editSets, reps: editReps.trim() || '10' },
    }));
    setEditingTargets(null);
  };

  // ── Live volume (draft state) ───────────────────────────────────────────
  const muscleTargets = userSettings?.muscleGroupTargets ?? {};
  const volumeByMuscle = useMemo(() => {
    const totals = new Map<PrimaryMuscleGroup, number>();
    for (const item of items) {
      if (item.kind !== 'exercise') continue;
      const ex = exerciseById.get(item.exerciseId);
      if (!ex) continue;
      const sets = targets[item.exerciseId]?.sets ?? ex.targetSets ?? effectiveDefaultFor(ex);
      const credit = sets * (ex.isUnilateral ? 0.5 : 1);
      const primaries = ex.primaryMuscleGroups
        ?? (ex.primaryMuscleGroup ? [ex.primaryMuscleGroup] : []);
      for (const mg of primaries) {
        totals.set(mg, (totals.get(mg) ?? 0) + credit);
      }
    }
    return Array.from(totals.entries()).sort((a, b) => b[1] - a[1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, targets, exerciseById, defaultSets]);

  // Muscle groups with a target that the draft leaves under-served
  const underGoal = useMemo(() => {
    const done = new Map(volumeByMuscle);
    return Object.entries(muscleTargets)
      .filter(([, target]) => (target as number) > 0)
      .map(([mg, target]) => ({
        mg: mg as PrimaryMuscleGroup,
        target: target as number,
        actual: done.get(mg as PrimaryMuscleGroup) ?? 0,
      }))
      .filter(x => x.actual < x.target)
      .sort((a, b) => (a.actual / a.target) - (b.actual / b.target));
  }, [volumeByMuscle, muscleTargets]);

  // ── Save ────────────────────────────────────────────────────────────────
  const performSave = async () => {
    setSaving(true);
    try {
      // Group exercises per day from the flat list
      const byDay = new Map<number, string[]>();
      let currentDay = -1;
      for (const item of items) {
        if (item.kind === 'header') {
          currentDay = item.day;
          if (!byDay.has(currentDay)) byDay.set(currentDay, []);
        } else if (currentDay >= 0) {
          byDay.get(currentDay)!.push(item.exerciseId);
        }
      }

      // One template per training day (empty days become rest in the schedule)
      const daySchedule: RoutineDaySchedule[] = Array.from({ length: 7 }, (_, day) => ({
        day,
        templateIds: [],
        dayType: 'rest' as const,
      }));

      for (const [day, exerciseIds] of byDay) {
        if (exerciseIds.length === 0) continue;
        const muscles = new Set<PrimaryMuscleGroup>();
        for (const id of exerciseIds) {
          const ex = exerciseById.get(id);
          const primaries = ex?.primaryMuscleGroups
            ?? (ex?.primaryMuscleGroup ? [ex.primaryMuscleGroup] : []);
          primaries.forEach(m => muscles.add(m));
        }
        const template: Template = {
          id: generateId(),
          name: `${name.trim()} — ${DAY_NAMES[day]}`,
          type: chooseTemplateType(muscles),
          locationId: dayLocations[day] ?? defaultLocationId,
          exerciseIds,
        };
        await addTemplate(template);
        daySchedule[day] = {
          day,
          templateIds: [template.id],
          dayType: 'workout',
        };
      }

      // Persist per-exercise targets (same semantics as the routine editor:
      // undefined when equal to the unilateral-aware default)
      for (const [exerciseId, t] of Object.entries(targets)) {
        const ex = exerciseById.get(exerciseId);
        if (!ex) continue;
        const newSets = t.sets === effectiveDefaultFor(ex) ? undefined : t.sets;
        const newReps = t.reps || undefined;
        if (newSets !== ex.targetSets || newReps !== ex.targetReps) {
          await updateExercise({ ...ex, targetSets: newSets, targetReps: newReps });
        }
      }

      const routine: Routine = {
        id: generateId(),
        name: name.trim(),
        daySchedule,
        isActive: routines.length === 0,
      };
      await addRoutine(routine);

      setSaving(false);
      // saving=true suppressed the beforeRemove guard; keep it false only after nav
      navigation.goBack();
    } catch (err: any) {
      setSaving(false);
      Alert.alert('Save Failed', err?.message ?? 'Could not save the routine.');
    }
  };

  const handleSave = () => {
    if (underGoal.length > 0) {
      // Warn, never block — surface the worst few gaps
      const preview = underGoal.slice(0, 3)
        .map(x => `${MUSCLE_GROUP_DISPLAY_NAMES[x.mg]} at ${x.actual}/${x.target}`)
        .join(', ');
      const suffix = underGoal.length > 3 ? ` (+${underGoal.length - 3} more)` : '';
      Alert.alert(
        'Under Volume Goals',
        `${preview}${suffix} — save anyway?`,
        [
          { text: 'Keep Editing', style: 'cancel' },
          { text: 'Save Anyway', onPress: performSave },
        ]
      );
      return;
    }
    performSave();
  };

  const pickerExercises = useMemo(() =>
    exercises
      .filter(e => matchesAllWords(e.name, pickerSearch))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [exercises, pickerSearch]
  );

  const locationName = (id: string | undefined) =>
    locations.find(l => l.id === id)?.name ?? locations[0]?.name ?? 'Gym';

  // ── Volume panel (shared by build + review) ─────────────────────────────
  const renderVolumePanel = () => (
    <View style={styles.volumePanel}>
      <Text style={styles.volumePanelTitle}>Weekly Volume vs Goals</Text>
      <View style={styles.volumeGrid}>
        {volumeByMuscle.length === 0 ? (
          <Text style={styles.volumeEmpty}>Add exercises to see volume</Text>
        ) : (
          volumeByMuscle.map(([mg, setsDone]) => {
            const target = (muscleTargets as Record<string, number>)[mg] ?? 0;
            const hasTarget = target > 0;
            const met = hasTarget && setsDone >= target;
            return (
              <View key={mg} style={styles.volumeCell}>
                <Text style={styles.volumeMuscle} numberOfLines={1}>
                  {MUSCLE_GROUP_DISPLAY_NAMES[mg]}
                </Text>
                <Text style={[
                  styles.volumeValue,
                  hasTarget && (met ? styles.volumeMet : styles.volumeUnder),
                ]}>
                  {Math.round(setsDone * 10) / 10}{hasTarget ? `/${target}` : ''}{met ? ' ✓' : ''}
                </Text>
              </View>
            );
          })
        )}
      </View>
    </View>
  );

  // ── Step renderers ──────────────────────────────────────────────────────

  const renderSetup = () => (
    <ScrollView style={styles.stepScroll} contentContainerStyle={styles.stepContent} keyboardShouldPersistTaps="handled">
      <Text style={styles.fieldLabel}>Routine Name</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="e.g. Fall Strength Block"
        placeholderTextColor={colors.textTertiary}
      />

      <Text style={styles.fieldLabel}>Training Days ({trainingDays.size}/week)</Text>
      <Text style={styles.fieldHint}>Tap to toggle. Unselected days are rest days.</Text>
      <View style={styles.dayToggleRow}>
        {DAY_NAMES_SHORT.map((label, day) => {
          const on = trainingDays.has(day);
          return (
            <TouchableOpacity
              key={day}
              style={[styles.dayToggle, on && styles.dayToggleOn]}
              onPress={() => toggleTrainingDay(day)}
            >
              <Text style={[styles.dayToggleText, on && styles.dayToggleTextOn]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {trainingDays.size > 0 && (
        <>
          <Text style={styles.fieldLabel}>Location Per Day</Text>
          {[...trainingDays].sort((a, b) => a - b).map(day => (
            <View key={day} style={styles.dayLocationRow}>
              <Text style={styles.dayLocationDay}>{DAY_NAMES[day]}</Text>
              <View style={styles.dayLocationChips}>
                {locations.map(loc => {
                  const selected = (dayLocations[day] ?? defaultLocationId) === loc.id;
                  return (
                    <TouchableOpacity
                      key={loc.id}
                      style={[styles.chip, selected && styles.chipSelected]}
                      onPress={() => setDayLocations(prev => ({ ...prev, [day]: loc.id }))}
                    >
                      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                        {loc.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))}
        </>
      )}

      <TouchableOpacity
        style={[styles.primaryButton, (!name.trim() || trainingDays.size === 0) && styles.buttonDisabled]}
        onPress={enterBuildStep}
        disabled={!name.trim() || trainingDays.size === 0}
      >
        <Text style={styles.primaryButtonText}>Next: Build Days</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  const renderBuildItem = ({ item, drag, isActive }: RenderItemParams<BuilderItem>) => {
    if (item.kind === 'header') {
      return (
        <View style={styles.dayHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.dayName}>{DAY_NAMES[item.day]}</Text>
            <Text style={styles.dayLocation}>{locationName(dayLocations[item.day] ?? defaultLocationId)}</Text>
          </View>
          <TouchableOpacity style={styles.addButton} onPress={() => setPickerForDay(item.day)}>
            <Ionicons name="add" size={18} color={colors.textOnPrimary} />
          </TouchableOpacity>
        </View>
      );
    }
    const exercise = exerciseById.get(item.exerciseId);
    const t = targets[item.exerciseId];
    const sets = t?.sets ?? exercise?.targetSets ?? effectiveDefaultFor(exercise);
    const reps = t?.reps ?? exercise?.targetReps ?? '10';
    return (
      <TouchableOpacity
        style={[styles.exerciseRow, isActive && styles.exerciseRowActive]}
        onLongPress={drag}
        delayLongPress={150}
        activeOpacity={0.9}
      >
        <Ionicons name="reorder-three-outline" size={22} color={colors.textTertiary} style={{ marginRight: spacing.xs }} />
        <Text style={styles.exerciseName} numberOfLines={1}>{exercise?.name ?? 'Unknown'}</Text>
        <TouchableOpacity style={styles.targetsChip} onPress={() => openTargetEditor(item.exerciseId)}>
          <Text style={styles.targetsText}>{sets}×{reps}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={{ padding: 4 }}
          onPress={() => setItems(prev => prev.filter(i => i.key !== item.key))}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="close" size={18} color={colors.error} />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const renderBuild = () => (
    <View style={{ flex: 1 }}>
      {renderVolumePanel()}
      <DraggableFlatList
        data={items}
        keyExtractor={i => i.key}
        renderItem={renderBuildItem}
        onDragEnd={handleDragEnd}
        containerStyle={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: spacing.xxl }}
      />
      <View style={styles.footerRow}>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => setStep('setup')}>
          <Text style={styles.secondaryButtonText}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.primaryButtonFlex, items.every(i => i.kind !== 'exercise') && styles.buttonDisabled]}
          onPress={() => setStep('review')}
          disabled={items.every(i => i.kind !== 'exercise')}
        >
          <Text style={styles.primaryButtonText}>Review</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderReview = () => {
    const dayCounts = [...trainingDays].sort((a, b) => a - b).map(day => ({
      day,
      count: items.filter(i => i.kind === 'exercise' && i.day === day).length,
    }));
    return (
      <ScrollView style={styles.stepScroll} contentContainerStyle={styles.stepContent}>
        <Text style={styles.reviewName}>{name.trim()}</Text>
        <Text style={styles.reviewMeta}>
          {trainingDays.size} training day{trainingDays.size === 1 ? '' : 's'} ·{' '}
          {items.filter(i => i.kind === 'exercise').length} exercises
        </Text>

        {dayCounts.map(({ day, count }) => (
          <View key={day} style={styles.reviewDayRow}>
            <Text style={styles.reviewDayName}>
              {DAY_NAMES[day]} · {locationName(dayLocations[day] ?? defaultLocationId)}
            </Text>
            <Text style={styles.reviewDayCount}>
              {count === 0 ? 'Rest (no exercises)' : `${count} exercise${count === 1 ? '' : 's'}`}
            </Text>
          </View>
        ))}

        {renderVolumePanel()}

        {underGoal.length > 0 && (
          <Text style={styles.underGoalNote}>
            {underGoal.length} muscle group{underGoal.length === 1 ? '' : 's'} under your weekly goal —
            you can still save, or go back and fill the gaps.
          </Text>
        )}

        <View style={styles.footerRow}>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => setStep('build')}>
            <Text style={styles.secondaryButtonText}>Back</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.primaryButtonFlex, saving && styles.buttonDisabled]}
            onPress={handleSave}
            disabled={saving}
          >
            <Text style={styles.primaryButtonText}>{saving ? 'Saving…' : 'Save Routine'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  };

  return (
    <SafeAreaView style={commonStyles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Build Routine</Text>
        <Text style={styles.stepBadge}>
          {step === 'setup' ? '1/3' : step === 'build' ? '2/3' : '3/3'}
        </Text>
      </View>

      {step === 'setup' && renderSetup()}
      {step === 'build' && renderBuild()}
      {step === 'review' && renderReview()}

      {/* Add-exercise picker */}
      <Modal
        visible={pickerForDay !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setPickerForDay(null)}
      >
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerSheet}>
            <Text style={styles.pickerTitle}>
              Add to {pickerForDay !== null ? DAY_NAMES[pickerForDay] : ''}
            </Text>
            <SearchBar value={pickerSearch} onChangeText={setPickerSearch} placeholder="Search exercises..." />
            <FlatList
              data={pickerExercises}
              keyExtractor={e => e.id}
              keyboardShouldPersistTaps="handled"
              style={styles.pickerList}
              renderItem={({ item: ex }) => (
                <TouchableOpacity style={styles.pickerRow} onPress={() => handleAddExercise(ex)}>
                  <Text style={styles.pickerRowText}>{ex.name}</Text>
                  <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={styles.pickerCancel} onPress={() => setPickerForDay(null)}>
              <Text style={styles.pickerCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Sets/reps editor */}
      <Modal
        visible={editingTargets !== null}
        animationType="fade"
        transparent
        onRequestClose={() => setEditingTargets(null)}
      >
        <View style={styles.targetOverlay}>
          <View style={styles.targetSheet}>
            <Text style={styles.targetTitle}>
              {editingTargets ? exerciseById.get(editingTargets)?.name : ''}
            </Text>
            <Text style={styles.fieldLabel}>Target Sets</Text>
            <View style={styles.stepperRow}>
              <TouchableOpacity style={styles.stepperButton} onPress={() => setEditSets(s => Math.max(1, s - 1))}>
                <Text style={styles.stepperButtonText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.stepperValue}>{editSets}</Text>
              <TouchableOpacity style={styles.stepperButton} onPress={() => setEditSets(s => s + 1)}>
                <Text style={styles.stepperButtonText}>+</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.fieldLabel}>Target Reps</Text>
            <TextInput
              style={styles.input}
              value={editReps}
              onChangeText={setEditReps}
              placeholder="e.g. 10 or 8-12"
              placeholderTextColor={colors.textTertiary}
            />
            <View style={styles.footerRow}>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => setEditingTargets(null)}>
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.primaryButtonFlex} onPress={saveTargetEditor}>
                <Text style={styles.primaryButtonText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  cancelText: { color: colors.textSecondary, fontSize: typography.size.md },
  title: { color: colors.text, fontSize: typography.size.lg, fontWeight: typography.weight.semibold },
  stepBadge: { color: colors.primary, fontSize: typography.size.sm, fontWeight: typography.weight.semibold, width: 50, textAlign: 'right' },
  stepScroll: { flex: 1 },
  stepContent: { padding: spacing.base, paddingBottom: spacing.xxl },
  fieldLabel: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  fieldHint: { fontSize: typography.size.xs, color: colors.textTertiary, marginBottom: spacing.sm },
  input: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text,
    fontSize: typography.size.md,
  },
  dayToggleRow: { flexDirection: 'row', gap: spacing.xs },
  dayToggle: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: borderRadius.md,
    backgroundColor: colors.backgroundTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayToggleOn: { backgroundColor: colors.primary },
  dayToggleText: { color: colors.textSecondary, fontSize: typography.size.sm, fontWeight: typography.weight.medium },
  dayToggleTextOn: { color: colors.textOnPrimary, fontWeight: typography.weight.semibold },
  dayLocationRow: { marginBottom: spacing.md },
  dayLocationDay: { color: colors.text, fontSize: typography.size.sm, fontWeight: typography.weight.medium, marginBottom: spacing.xs },
  dayLocationChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.backgroundTertiary,
    borderRadius: borderRadius.md,
  },
  chipSelected: { backgroundColor: colors.primary },
  chipText: { color: colors.textSecondary, fontSize: typography.size.sm },
  chipTextSelected: { color: colors.textOnPrimary, fontWeight: typography.weight.semibold },
  primaryButton: {
    marginTop: spacing.xl,
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  primaryButtonFlex: {
    flex: 1,
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  primaryButtonText: { color: colors.textOnPrimary, fontSize: typography.size.md, fontWeight: typography.weight.semibold },
  secondaryButton: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    backgroundColor: colors.backgroundTertiary,
    alignItems: 'center',
  },
  secondaryButtonText: { color: colors.text, fontSize: typography.size.md },
  buttonDisabled: { opacity: 0.5 },
  footerRow: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.base,
  },
  // Volume panel
  volumePanel: {
    backgroundColor: colors.backgroundSecondary,
    marginHorizontal: spacing.base,
    marginTop: spacing.sm,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  volumePanelTitle: {
    color: colors.textSecondary,
    fontSize: typography.size.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  volumeGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  volumeCell: { width: '33.33%', marginBottom: spacing.xs },
  volumeMuscle: { color: colors.textSecondary, fontSize: typography.size.xs },
  volumeValue: { color: colors.text, fontSize: typography.size.sm, fontWeight: typography.weight.semibold },
  volumeMet: { color: colors.success },
  volumeUnder: { color: colors.warning },
  volumeEmpty: { color: colors.textTertiary, fontSize: typography.size.sm },
  // Build list
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundSecondary,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    marginTop: spacing.md,
    borderTopWidth: 2,
    borderTopColor: colors.primary,
  },
  dayName: {
    color: colors.primary,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dayLocation: { color: colors.textSecondary, fontSize: typography.size.xs, marginTop: 1 },
  addButton: {
    backgroundColor: colors.primary,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    backgroundColor: colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
    gap: spacing.sm,
  },
  exerciseRowActive: { backgroundColor: colors.backgroundElevated, borderRadius: borderRadius.md },
  exerciseName: { flex: 1, color: colors.text, fontSize: typography.size.md },
  targetsChip: {
    backgroundColor: colors.backgroundTertiary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
  },
  targetsText: { color: colors.text, fontSize: typography.size.sm, fontVariant: ['tabular-nums'] },
  // Review
  reviewName: { color: colors.text, fontSize: typography.size.xl, fontWeight: typography.weight.semibold },
  reviewMeta: { color: colors.textSecondary, fontSize: typography.size.sm, marginTop: spacing.xs, marginBottom: spacing.md },
  reviewDayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  reviewDayName: { color: colors.text, fontSize: typography.size.md },
  reviewDayCount: { color: colors.textSecondary, fontSize: typography.size.sm },
  underGoalNote: {
    color: colors.warning,
    fontSize: typography.size.sm,
    marginTop: spacing.md,
  },
  // Picker + target modals (mirrors RoutineEditorScreen)
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  pickerSheet: {
    backgroundColor: colors.backgroundSecondary,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.base,
    maxHeight: '75%',
  },
  pickerTitle: {
    color: colors.text,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  pickerList: { marginTop: spacing.sm },
  pickerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  pickerRowText: { color: colors.text, fontSize: typography.size.md, flex: 1 },
  pickerCancel: { alignItems: 'center', paddingVertical: spacing.md },
  pickerCancelText: { color: colors.textSecondary, fontSize: typography.size.md },
  targetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  targetSheet: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    width: '100%',
  },
  targetTitle: {
    color: colors.text,
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    textAlign: 'center',
  },
  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  stepperButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.backgroundTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonText: { color: colors.text, fontSize: typography.size.xl },
  stepperValue: {
    color: colors.text,
    fontSize: typography.size.xl,
    fontWeight: typography.weight.semibold,
    minWidth: 40,
    textAlign: 'center',
  },
});

export default RoutineBuilderScreen;
