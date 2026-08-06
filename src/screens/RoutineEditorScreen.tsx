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
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, borderRadius, commonStyles } from '../theme';
import { SearchBar } from '../components/common';
import { useData } from '../contexts/DataContext';
import { Exercise, Template, DAY_NAMES, PrimaryMuscleGroup, MUSCLE_GROUP_DISPLAY_NAMES } from '../types';
import { RootStackParamList } from '../navigation/types';
import { matchesAllWords } from '../utils/search';

type RoutineEditorRouteProp = RouteProp<RootStackParamList, 'RoutineEditor'>;
type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

// The editor renders one flat draggable list: day headers interleaved with
// exercise rows. Dragging an exercise past a header moves it to that day.
// Headers themselves aren't draggable.
type EditorItem =
  | { kind: 'header'; key: string; day: number; templateId: string }
  | { kind: 'exercise'; key: string; day: number; exerciseId: string };

interface TargetEdit {
  targetSets?: number;
  targetReps?: string;
}

export function RoutineEditorScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RoutineEditorRouteProp>();
  const { routineId } = route.params;
  const { routines, templates, exercises, userSettings, updateTemplate, updateExercise } = useData();

  const routine = routines.find(r => r.id === routineId);

  // Build the initial flat list from the routine's workout days.
  // Only days with at least one template are editable here; rest/cardio days
  // have no exercise list to organize.
  const buildItems = useCallback((): EditorItem[] => {
    if (!routine) return [];
    const items: EditorItem[] = [];
    for (const day of [...routine.daySchedule].sort((a, b) => a.day - b.day)) {
      const templateId = day.templateIds[0];
      if (!templateId) continue;
      const template = templates.find(t => t.id === templateId);
      if (!template) continue;
      items.push({ kind: 'header', key: `h-${day.day}`, day: day.day, templateId });
      template.exerciseIds.forEach((exerciseId, i) => {
        items.push({
          kind: 'exercise',
          key: `e-${day.day}-${exerciseId}-${i}`,
          day: day.day,
          exerciseId,
        });
      });
    }
    return items;
  }, [routine, templates]);

  const [items, setItems] = useState<EditorItem[]>(buildItems);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // Per-exercise target edits, applied on Save
  const [targetEdits, setTargetEdits] = useState<Record<string, TargetEdit>>({});

  // Add-exercise picker state
  const [pickerForDay, setPickerForDay] = useState<number | null>(null);
  const [pickerSearch, setPickerSearch] = useState('');

  // Sets/reps editor state
  const [editingTargets, setEditingTargets] = useState<{ exerciseId: string } | null>(null);
  const [editSets, setEditSets] = useState(3);
  const [editReps, setEditReps] = useState('');

  const defaultSets = userSettings?.defaultTargetSets ?? 3;

  const exerciseById = useMemo(
    () => new Map(exercises.map(e => [e.id, e])),
    [exercises]
  );

  // Confirm on exit with unsaved changes
  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', (e) => {
      if (!dirty || saving) return;
      e.preventDefault();
      Alert.alert('Save changes to routine?', 'You have unsaved changes.', [
        { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save',
          onPress: async () => {
            await persistChanges();
            navigation.dispatch(e.data.action);
          },
        },
      ]);
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, dirty, saving, items, targetEdits]);

  // Rebuild items map on drag end. Exercises inherit the day of the nearest
  // header above them; anything dropped above the first header snaps back
  // under it.
  const handleDragEnd = ({ data }: { data: EditorItem[] }) => {
    const firstHeaderIdx = data.findIndex(i => i.kind === 'header');
    if (firstHeaderIdx > 0) {
      // Move any stray exercises above the first header to just after it
      const strays = data.slice(0, firstHeaderIdx);
      data = [...data.slice(firstHeaderIdx, firstHeaderIdx + 1), ...strays, ...data.slice(firstHeaderIdx + 1)];
    }
    let currentDay = -1;
    const rekeyed = data.map(item => {
      if (item.kind === 'header') {
        currentDay = item.day;
        return item;
      }
      return { ...item, day: currentDay };
    });
    setItems(rekeyed);
    setDirty(true);
  };

  const handleRemove = (key: string) => {
    setItems(prev => prev.filter(i => i.key !== key));
    setDirty(true);
  };

  const handleAddExercise = (exercise: Exercise) => {
    if (pickerForDay === null) return;
    setItems(prev => {
      // Insert at the end of the day's block: right before the next header
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
    setDirty(true);
    setPickerForDay(null);
    setPickerSearch('');
  };

  // Effective default respects the unilateral doubling — a unilateral exercise's
  // TOTAL target is base*2 (3 per side = 6). Storing an undoubled total on a
  // unilateral exercise is what made progress circles complete early.
  const effectiveDefaultFor = (ex: Exercise | undefined): number =>
    ex?.isUnilateral ? defaultSets * 2 : defaultSets;

  const openTargetEditor = (exerciseId: string) => {
    const ex = exerciseById.get(exerciseId);
    const edit = targetEdits[exerciseId];
    setEditSets(edit?.targetSets ?? ex?.targetSets ?? effectiveDefaultFor(ex));
    setEditReps(edit?.targetReps ?? ex?.targetReps ?? '');
    setEditingTargets({ exerciseId });
  };

  const saveTargetEditor = () => {
    if (!editingTargets) return;
    setTargetEdits(prev => ({
      ...prev,
      [editingTargets.exerciseId]: {
        targetSets: editSets,
        targetReps: editReps.trim() || undefined,
      },
    }));
    setDirty(true);
    setEditingTargets(null);
  };

  const persistChanges = async () => {
    if (!routine) return;
    setSaving(true);
    try {
      // 1. Rebuild each day-template's exerciseIds from the flat list
      const idsByTemplate = new Map<string, string[]>();
      let currentTemplateId: string | null = null;
      for (const item of items) {
        if (item.kind === 'header') {
          currentTemplateId = item.templateId;
          if (!idsByTemplate.has(item.templateId)) idsByTemplate.set(item.templateId, []);
        } else if (currentTemplateId) {
          idsByTemplate.get(currentTemplateId)!.push(item.exerciseId);
        }
      }
      for (const [templateId, exerciseIds] of idsByTemplate) {
        const template = templates.find(t => t.id === templateId);
        if (!template) continue;
        const changed =
          template.exerciseIds.length !== exerciseIds.length ||
          template.exerciseIds.some((id, i) => id !== exerciseIds[i]);
        if (changed) {
          const updated: Template = { ...template, exerciseIds };
          await updateTemplate(updated);
        }
      }

      // 2. Apply per-exercise target edits
      for (const [exerciseId, edit] of Object.entries(targetEdits)) {
        const ex = exerciseById.get(exerciseId);
        if (!ex) continue;
        const changed =
          (edit.targetSets !== undefined && edit.targetSets !== ex.targetSets) ||
          (edit.targetReps !== (ex.targetReps ?? undefined));
        if (changed) {
          await updateExercise({
            ...ex,
            // Store undefined when the chosen total equals the (unilateral-aware)
            // default so the exercise keeps tracking future default changes.
            targetSets: edit.targetSets === effectiveDefaultFor(ex) ? undefined : edit.targetSets,
            targetReps: edit.targetReps,
          });
        }
      }

      setDirty(false);
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    await persistChanges();
    navigation.goBack();
  };

  const pickerExercises = useMemo(() => {
    return exercises
      .filter(e => matchesAllWords(e.name, pickerSearch))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [exercises, pickerSearch]);

  // ─── Live weekly volume per muscle group ──────────────────────────────────
  // Recomputed from the DRAFT state (items + unsaved target edits) so totals
  // update instantly on add/remove/move/target-change — no save required.
  // Matches the analytics volume rules: each set credits every PRIMARY muscle
  // group; unilateral sets count half (6 logged = 3 credited).
  const [volumePanelOpen, setVolumePanelOpen] = useState(true);
  const volumeByMuscle = useMemo(() => {
    const totals = new Map<PrimaryMuscleGroup, number>();
    for (const item of items) {
      if (item.kind !== 'exercise') continue;
      const ex = exerciseById.get(item.exerciseId);
      if (!ex) continue;
      const sets =
        targetEdits[item.exerciseId]?.targetSets
        ?? ex.targetSets
        ?? (ex.isUnilateral ? defaultSets * 2 : defaultSets);
      const credit = sets * (ex.isUnilateral ? 0.5 : 1);
      const primaries = ex.primaryMuscleGroups
        ?? (ex.primaryMuscleGroup ? [ex.primaryMuscleGroup] : []);
      for (const mg of primaries) {
        totals.set(mg, (totals.get(mg) ?? 0) + credit);
      }
    }
    // Sort descending by volume for a stable, scannable panel
    return Array.from(totals.entries()).sort((a, b) => b[1] - a[1]);
  }, [items, targetEdits, exerciseById, defaultSets]);

  const muscleTargets = userSettings?.muscleGroupTargets ?? {};

  const renderItem = ({ item, drag, isActive }: RenderItemParams<EditorItem>) => {
    if (item.kind === 'header') {
      const template = templates.find(t => t.id === item.templateId);
      return (
        <View style={styles.dayHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.dayName}>{DAY_NAMES[item.day]}</Text>
            <Text style={styles.templateName}>{template?.name ?? 'Unknown template'}</Text>
          </View>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => setPickerForDay(item.day)}
          >
            <Ionicons name="add" size={18} color={colors.textOnPrimary} />
          </TouchableOpacity>
        </View>
      );
    }

    const exercise = exerciseById.get(item.exerciseId);
    const edit = targetEdits[item.exerciseId];
    const sets = edit?.targetSets ?? exercise?.targetSets ?? effectiveDefaultFor(exercise);
    const reps = edit?.targetReps ?? exercise?.targetReps;
    return (
      <TouchableOpacity
        style={[styles.exerciseRow, isActive && styles.exerciseRowActive]}
        onLongPress={drag}
        delayLongPress={150}
        activeOpacity={0.9}
      >
        <Ionicons name="reorder-three-outline" size={22} color={colors.textTertiary} style={styles.dragHandle} />
        <View style={{ flex: 1 }}>
          <Text style={styles.exerciseName}>{exercise?.name ?? 'Unknown exercise'}</Text>
        </View>
        <TouchableOpacity
          style={styles.targetsChip}
          onPress={() => openTargetEditor(item.exerciseId)}
        >
          <Text style={styles.targetsText}>
            {sets}×{reps || '—'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.removeButton}
          onPress={() => handleRemove(item.key)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="close" size={18} color={colors.error} />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  if (!routine) {
    return (
      <SafeAreaView style={commonStyles.safeArea} edges={['top']}>
        <View style={styles.center}>
          <Text style={styles.emptyText}>Routine not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={commonStyles.safeArea} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.cancelText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>{routine.name}</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving || !dirty}>
          <Text style={[styles.saveText, (!dirty || saving) && styles.saveTextDisabled]}>
            {saving ? 'Saving…' : 'Save'}
          </Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.hint}>
        Long-press an exercise to drag it — within a day or into another day.
      </Text>

      {/* Live weekly volume panel — reflects the current draft, not saved state */}
      <View style={styles.volumePanel}>
        <TouchableOpacity
          style={styles.volumePanelHeader}
          onPress={() => setVolumePanelOpen(o => !o)}
          activeOpacity={0.7}
        >
          <Text style={styles.volumePanelTitle}>Weekly Volume</Text>
          <Ionicons
            name={volumePanelOpen ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={colors.textSecondary}
          />
        </TouchableOpacity>
        {volumePanelOpen && (
          <View style={styles.volumeGrid}>
            {volumeByMuscle.length === 0 ? (
              <Text style={styles.volumeEmpty}>No exercises yet</Text>
            ) : (
              volumeByMuscle.map(([mg, sets]) => {
                const target = muscleTargets[mg] ?? 0;
                const display = Number.isInteger(sets) ? String(sets) : sets.toFixed(1);
                const hasTarget = target > 0;
                const met = hasTarget && sets >= target;
                return (
                  <View key={mg} style={styles.volumeCell}>
                    <Text style={styles.volumeMuscle} numberOfLines={1}>
                      {MUSCLE_GROUP_DISPLAY_NAMES[mg] ?? mg}
                    </Text>
                    <Text
                      style={[
                        styles.volumeValue,
                        hasTarget && (met ? styles.volumeMet : styles.volumeUnder),
                      ]}
                    >
                      {hasTarget ? `${display}/${target}${met ? ' ✓' : ''}` : display}
                    </Text>
                  </View>
                );
              })
            )}
          </View>
        )}
      </View>

      <DraggableFlatList
        data={items}
        keyExtractor={item => item.key}
        renderItem={renderItem}
        onDragEnd={handleDragEnd}
        containerStyle={{ flex: 1 }}
        contentContainerStyle={styles.listContent}
      />

      {/* Add-exercise picker */}
      <Modal
        visible={pickerForDay !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setPickerForDay(null)}
      >
        <KeyboardAvoidingView
          style={styles.pickerOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.pickerSheet}>
            <Text style={styles.pickerTitle}>
              Add to {pickerForDay !== null ? DAY_NAMES[pickerForDay] : ''}
            </Text>
            <SearchBar
              value={pickerSearch}
              onChangeText={setPickerSearch}
              placeholder="Search exercises..."
            />
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
        </KeyboardAvoidingView>
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
              {editingTargets ? exerciseById.get(editingTargets.exerciseId)?.name : ''}
            </Text>

            <Text style={styles.fieldLabel}>Target Sets</Text>
            <View style={styles.stepperRow}>
              <TouchableOpacity
                style={styles.stepperButton}
                onPress={() => setEditSets(s => Math.max(1, s - 1))}
              >
                <Text style={styles.stepperButtonText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.stepperValue}>{editSets}</Text>
              <TouchableOpacity
                style={styles.stepperButton}
                onPress={() => setEditSets(s => s + 1)}
              >
                <Text style={styles.stepperButtonText}>+</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>Target Reps</Text>
            <TextInput
              style={styles.repsInput}
              value={editReps}
              onChangeText={setEditReps}
              placeholder="e.g. 8 or 8-15"
              placeholderTextColor={colors.textTertiary}
            />

            <View style={styles.targetActions}>
              <TouchableOpacity style={styles.targetCancel} onPress={() => setEditingTargets(null)}>
                <Text style={styles.targetCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.targetSave} onPress={saveTargetEditor}>
                <Text style={styles.targetSaveText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: colors.textSecondary, fontSize: typography.size.md },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  cancelText: { color: colors.textSecondary, fontSize: typography.size.md },
  title: {
    flex: 1,
    textAlign: 'center',
    color: colors.text,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
  },
  saveText: { color: colors.primary, fontSize: typography.size.md, fontWeight: typography.weight.semibold },
  saveTextDisabled: { opacity: 0.4 },
  hint: {
    color: colors.textTertiary,
    fontSize: typography.size.xs,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  listContent: { paddingBottom: spacing.xxl },
  volumePanel: {
    marginHorizontal: spacing.base,
    marginBottom: spacing.xs,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  volumePanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  volumePanelTitle: {
    color: colors.textSecondary,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  volumeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  volumeCell: {
    width: '50%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
    paddingRight: spacing.md,
  },
  volumeMuscle: {
    color: colors.text,
    fontSize: typography.size.sm,
    flexShrink: 1,
  },
  volumeValue: {
    color: colors.textSecondary,
    fontSize: typography.size.sm,
    fontVariant: ['tabular-nums'],
    marginLeft: spacing.sm,
  },
  volumeMet: {
    color: colors.success,
    fontWeight: typography.weight.semibold,
  },
  volumeUnder: {
    color: colors.warning,
  },
  volumeEmpty: {
    color: colors.textTertiary,
    fontSize: typography.size.sm,
    paddingBottom: spacing.sm,
  },
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
  templateName: { color: colors.textSecondary, fontSize: typography.size.xs, marginTop: 1 },
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
  exerciseRowActive: {
    backgroundColor: colors.backgroundElevated,
    borderRadius: borderRadius.md,
  },
  dragHandle: { marginRight: spacing.xs },
  exerciseName: { color: colors.text, fontSize: typography.size.md },
  targetsChip: {
    backgroundColor: colors.backgroundTertiary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
  },
  targetsText: { color: colors.text, fontSize: typography.size.sm, fontVariant: ['tabular-nums'] },
  removeButton: { padding: 4 },
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
    marginBottom: spacing.md,
  },
  fieldLabel: {
    color: colors.textSecondary,
    fontSize: typography.size.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
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
  repsInput: {
    backgroundColor: colors.backgroundTertiary,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text,
    fontSize: typography.size.md,
  },
  targetActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  targetCancel: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.backgroundTertiary,
    alignItems: 'center',
  },
  targetCancelText: { color: colors.text, fontSize: typography.size.md },
  targetSave: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  targetSaveText: { color: colors.textOnPrimary, fontSize: typography.size.md, fontWeight: typography.weight.semibold },
});

export default RoutineEditorScreen;
