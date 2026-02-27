import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, borderRadius } from '../../theme';
import { MonthlyReport } from '../../services/insights';
import { format, parse } from 'date-fns';

interface Props {
  visible: boolean;
  onClose: () => void;
  report: MonthlyReport | null;
}

const GRADE_COLORS: Record<string, string> = {
  A: '#4CAF50',
  B: '#5B8DEF',
  C: '#FFC52F',
  D: '#FF9800',
  F: '#DC2626',
};

function ScoreBar({ label, score }: { label: string; score: number }) {
  const width = `${Math.min(100, Math.max(0, score))}%`;
  const barColor = score >= 80 ? '#4CAF50' : score >= 60 ? '#FFC52F' : '#DC2626';

  return (
    <View style={styles.scoreBarContainer}>
      <View style={styles.scoreBarHeader}>
        <Text style={styles.scoreBarLabel}>{label}</Text>
        <Text style={styles.scoreBarValue}>{score}%</Text>
      </View>
      <View style={styles.scoreBarTrack}>
        <View style={[styles.scoreBarFill, { width: width as any, backgroundColor: barColor }]} />
      </View>
    </View>
  );
}

export function MonthlyReportModal({ visible, onClose, report }: Props) {
  if (!report) return null;

  const monthDate = parse(report.month, 'yyyy-MM', new Date());
  const monthName = format(monthDate, 'MMMM yyyy');
  const gradeColor = GRADE_COLORS[report.overallGrade] || colors.textSecondary;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Monthly Report</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Month & Grade */}
          <View style={styles.gradeSection}>
            <Text style={styles.monthName}>{monthName}</Text>
            <View style={[styles.gradeBadge, { backgroundColor: gradeColor + '20' }]}>
              <Text style={[styles.gradeText, { color: gradeColor }]}>
                {report.overallGrade}
              </Text>
            </View>
          </View>

          {/* Score Breakdown */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Score Breakdown</Text>
            <ScoreBar label="Training" score={report.trainingScore} />
            <ScoreBar label="Nutrition" score={report.nutritionScore} />
            <ScoreBar label="Consistency" score={report.consistencyScore} />
          </View>

          {/* Stats Row */}
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{report.workoutsCompleted}</Text>
              <Text style={styles.statLabel}>Workouts</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{report.prsCount}</Text>
              <Text style={styles.statLabel}>PRs</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{report.perfectDays}</Text>
              <Text style={styles.statLabel}>Perfect Days</Text>
            </View>
          </View>

          {/* Highlights */}
          {report.highlights.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Highlights</Text>
              {report.highlights.map((h, i) => (
                <View key={i} style={styles.bulletRow}>
                  <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />
                  <Text style={styles.bulletText}>{h}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Areas to Improve */}
          {report.areasToImprove.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Areas to Improve</Text>
              {report.areasToImprove.map((a, i) => (
                <View key={i} style={styles.bulletRow}>
                  <Ionicons name="arrow-forward-circle" size={16} color="#FFC52F" />
                  <Text style={styles.bulletText}>{a}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Strength Changes */}
          {report.strengthChanges.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Strength Changes</Text>
              {report.strengthChanges.map((sc, i) => (
                <View key={i} style={styles.changeRow}>
                  <Text style={styles.changeMuscle}>{sc.muscle}</Text>
                  <View style={styles.changeArrow}>
                    <Text style={styles.changeFrom}>{sc.from}</Text>
                    <Ionicons name="arrow-forward" size={14} color={colors.primary} />
                    <Text style={styles.changeTo}>{sc.to}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Body Changes */}
          {report.bodyChanges.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Body Changes</Text>
              {report.bodyChanges.map((bc, i) => (
                <View key={i} style={styles.changeRow}>
                  <Text style={styles.changeMuscle}>{bc.metric}</Text>
                  <Text style={[
                    styles.changeValue,
                    { color: bc.direction === 'up' ? '#4CAF50' : '#5B8DEF' },
                  ]}>
                    {bc.change}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </View>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  headerTitle: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    color: colors.text,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.base,
    paddingBottom: spacing.xxxl,
  },
  gradeSection: {
    alignItems: 'center',
    marginVertical: spacing.lg,
  },
  monthName: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  gradeBadge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradeText: {
    fontSize: typography.size.xxxl,
    fontWeight: typography.weight.bold,
  },
  card: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginBottom: spacing.md,
  },
  cardTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  scoreBarContainer: {
    marginBottom: spacing.md,
  },
  scoreBarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  scoreBarLabel: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  scoreBarValue: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    color: colors.text,
  },
  scoreBarTrack: {
    height: 8,
    backgroundColor: colors.backgroundTertiary,
    borderRadius: 4,
    overflow: 'hidden',
  },
  scoreBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  statBox: {
    flex: 1,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    alignItems: 'center',
  },
  statValue: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: colors.primary,
  },
  statLabel: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  bulletText: {
    fontSize: typography.size.sm,
    color: colors.text,
    flex: 1,
    lineHeight: typography.size.sm * 1.5,
  },
  changeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  changeMuscle: {
    fontSize: typography.size.sm,
    color: colors.text,
    fontWeight: typography.weight.medium,
  },
  changeArrow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  changeFrom: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  changeTo: {
    fontSize: typography.size.sm,
    color: colors.primary,
    fontWeight: typography.weight.medium,
  },
  changeValue: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
  },
});

export default MonthlyReportModal;
