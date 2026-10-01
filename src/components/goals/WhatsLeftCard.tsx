import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../common';
import { colors, typography, spacing, borderRadius } from '../../theme';
import { formatSets, summarizeGaps, type MuscleGap, type WeekGapsView } from '../../services/weekGaps';

interface WhatsLeftCardProps {
  view: WeekGapsView;
  onPressGroup: (muscleGroup: string) => void;
  onStart: () => void;
}

/**
 * What the week still owes, by muscle rather than by exercise, split into what
 * the remaining planned days will cover and what they will not. The uncovered
 * list is the one that answers "what do I do tonight"; each line names a
 * couple of exercises so it is obvious that any of them counts.
 */
export function WhatsLeftCard({ view, onPressGroup, onStart }: WhatsLeftCardProps) {
  const { covered, uncovered, upcomingDays } = view;
  const days = upcomingDays.length > 0 ? upcomingDays.join('/') : null;

  return (
    <Card padding="none">
      {uncovered.length > 0 ? (
        <>
          <Text style={styles.subhead}>{days ? `Not covered by ${days}` : 'Nothing else planned this week'}</Text>
          {uncovered.map((gap, i) => (
            <GapRow key={gap.muscleGroup} gap={gap} first={i === 0} onPress={() => onPressGroup(gap.muscleGroup)} />
          ))}
        </>
      ) : (
        <Text style={styles.allCovered}>
          {days ? `Everything left is covered by ${days}` : 'Nothing left this week'}
        </Text>
      )}

      {covered.length > 0 && days && (
        <Text testID="whats-left-covered" style={styles.covered}>
          Covered by {days}: {summarizeGaps(covered)}
        </Text>
      )}

      {uncovered.length > 0 && (
        <TouchableOpacity style={styles.startButton} onPress={onStart} activeOpacity={0.7}>
          <Ionicons name="barbell-outline" size={18} color={colors.primary} />
          <Text style={styles.startText}>Start Workout For These ({uncovered.length})</Text>
        </TouchableOpacity>
      )}
    </Card>
  );
}

function GapRow({ gap, first, onPress }: { gap: MuscleGap; first: boolean; onPress: () => void }) {
  const examples = gap.suggestions.map(s => s.name).join(', ');
  return (
    <TouchableOpacity
      testID={`gap-row-${gap.muscleGroup}`}
      style={[styles.row, first && styles.rowFirst]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.rowTop}>
        <Text style={styles.name}>
          {gap.label}: {formatSets(gap.remaining)} {gap.remaining === 1 ? 'set' : 'sets'}
        </Text>
        <Text style={[styles.pace, gap.pace === 'behind' && styles.paceBehind]}>
          {gap.pace === 'behind' ? 'behind pace' : 'on pace'}
        </Text>
      </View>
      <Text style={styles.detail}>
        {formatSets(gap.completed)} of {gap.target} done
        {examples ? ` · e.g. ${examples}` : ''}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  subhead: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.textSecondary,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
  },
  row: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  rowFirst: {
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  name: {
    flex: 1,
    fontSize: typography.size.md,
    fontWeight: typography.weight.medium,
    color: colors.text,
  },
  pace: {
    fontSize: typography.size.xs,
    color: colors.textTertiary,
  },
  paceBehind: {
    color: colors.warning,
  },
  detail: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  covered: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  allCovered: {
    fontSize: typography.size.base,
    color: colors.textSecondary,
    padding: spacing.base,
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
    borderBottomLeftRadius: borderRadius.lg,
    borderBottomRightRadius: borderRadius.lg,
  },
  startText: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.primary,
  },
});
