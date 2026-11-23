/**
 * Pain log: log where it hurts (area, side, 0-10, note) and see recent
 * entries. A score of 3+ in the last 14 days puts a warning on any exercise
 * that works that area during a workout.
 */
import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { format, parseISO } from 'date-fns';
import { colors, typography, spacing, borderRadius, commonStyles } from '../theme';
import { Button, Card } from '../components/common';
import { PAIN_AREAS, PAIN_SIDES, PAIN_WARN_SCORE, PAIN_WINDOW_DAYS, painAreaLabel } from '../services/painLog';
import { addPainEntry, deletePainEntry, getPainLog, mergePainLogFromCloud } from '../services/painLogStore';
import type { PainArea, PainLogEntry, PainSide } from '../types';

const SCORES = Array.from({ length: 11 }, (_, i) => i);
const today = () => format(new Date(), 'yyyy-MM-dd');

export function PainLogScreen() {
  const [entries, setEntries] = useState<PainLogEntry[]>([]);
  const [area, setArea] = useState<PainArea | null>(null);
  const [side, setSide] = useState<PainSide>('both');
  const [score, setScore] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [date, setDate] = useState(today());

  useFocusEffect(
    useCallback(() => {
      let live = true;
      getPainLog().then(e => live && setEntries(e));
      mergePainLogFromCloud().then(e => live && setEntries(e));
      return () => {
        live = false;
      };
    }, []),
  );

  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(parseISO(date).getTime());
  const canSave = area !== null && score !== null && validDate;

  const save = async () => {
    if (!canSave) return;
    const entry: PainLogEntry = {
      id: `pain-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      date,
      area: area!,
      side,
      score: score!,
      ...(note.trim() ? { note: note.trim() } : {}),
    };
    setEntries(await addPainEntry(entry));
    setArea(null);
    setScore(null);
    setNote('');
    setSide('both');
    setDate(today());
  };

  const remove = (entry: PainLogEntry) => {
    const go = async () => setEntries(await deletePainEntry(entry.id));
    if (Platform.OS === 'web') {
      go();
      return;
    }
    Alert.alert('Delete entry?', `${painAreaLabel(entry.area)} ${entry.score}/10 on ${entry.date}`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: go },
    ]);
  };

  const chip = (on: boolean, label: string, onPress: () => void, key: string, wide = false) => (
    <TouchableOpacity key={key} style={[styles.chip, wide && styles.chipWide, on && styles.chipOn]} onPress={onPress} testID={`pain-${key}`}>
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <ScrollView style={commonStyles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.section}>Log pain</Text>
      <Card>
        <Text style={styles.label}>Area</Text>
        <View style={styles.wrap}>{PAIN_AREAS.map(a => chip(area === a.key, a.label, () => setArea(a.key), `area-${a.key}`))}</View>
        <Text style={styles.label}>Side</Text>
        <View style={styles.wrap}>{PAIN_SIDES.map(s => chip(side === s.key, s.label, () => setSide(s.key), `side-${s.key}`))}</View>
        <Text style={styles.label}>Score (0 = none, 10 = worst)</Text>
        <View style={styles.wrap}>{SCORES.map(n => chip(score === n, String(n), () => setScore(n), `score-${n}`))}</View>
        <Text style={styles.label}>Date</Text>
        <TextInput style={[styles.input, !validDate && styles.inputBad]} value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textTertiary} />
        <Text style={styles.label}>Note</Text>
        <TextInput
          style={[styles.input, styles.note]}
          value={note}
          onChangeText={setNote}
          placeholder="What it feels like, what set it off"
          placeholderTextColor={colors.textTertiary}
          multiline
        />
        <Button title="Save" onPress={save} disabled={!canSave} fullWidth />
        <Text style={styles.hint}>
          A score of {PAIN_WARN_SCORE} or more puts a warning on exercises that work that area for {PAIN_WINDOW_DAYS} days.
        </Text>
      </Card>

      <Text style={styles.section}>Recent</Text>
      <Card padding="none">
        {entries.length === 0 ? (
          <Text style={[styles.hint, styles.empty]}>Nothing logged.</Text>
        ) : (
          entries.slice(0, 60).map((e, i) => (
            <TouchableOpacity key={e.id} style={[styles.row, i > 0 && styles.rowBorder]} onLongPress={() => remove(e)} onPress={() => remove(e)}>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>
                  {painAreaLabel(e.area)}
                  {e.side !== 'both' ? ` (${e.side})` : ''}
                </Text>
                <Text style={styles.rowDetail}>
                  {format(parseISO(e.date), 'EEE MMM d')}
                  {e.note ? ` · ${e.note}` : ''}
                </Text>
              </View>
              <Text style={[styles.score, e.score >= PAIN_WARN_SCORE && styles.scoreHigh]}>{e.score}/10</Text>
            </TouchableOpacity>
          ))
        )}
      </Card>
      {entries.length > 0 && <Text style={[styles.hint, styles.padded]}>Tap an entry to delete it.</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.base, paddingBottom: spacing.xxxl },
  section: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  label: { fontSize: typography.size.sm, color: colors.textSecondary, marginTop: spacing.sm, marginBottom: spacing.xs },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: 36,
    alignItems: 'center',
  },
  chipWide: { minWidth: 80 },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textSecondary, fontSize: typography.size.sm },
  chipTextOn: { color: colors.textOnPrimary, fontWeight: typography.weight.semibold },
  input: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.backgroundTertiary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text,
    fontSize: typography.size.md,
    marginBottom: spacing.sm,
  },
  inputBad: { borderColor: colors.error },
  note: { minHeight: 60, textAlignVertical: 'top' },
  hint: { fontSize: typography.size.sm, color: colors.textSecondary, marginTop: spacing.sm },
  padded: { paddingHorizontal: spacing.sm },
  empty: { padding: spacing.base },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.base, paddingVertical: spacing.sm },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
  rowText: { flex: 1 },
  rowTitle: { fontSize: typography.size.md, color: colors.text },
  rowDetail: { fontSize: typography.size.sm, color: colors.textSecondary },
  score: { fontSize: typography.size.md, fontWeight: typography.weight.semibold, color: colors.text },
  scoreHigh: { color: colors.warning },
});
