import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, subMonths } from 'date-fns';
import { Card } from '../common';
import { colors, typography, spacing, borderRadius } from '../../theme';
import { useData } from '../../contexts/DataContext';
import { useBodyWeight } from '../../hooks/useBodyWeight';
import { getCachedInsights, getCachedMonthlyReport, Insight, InsightsInput, MonthlyReport } from '../../services/insights';
import { MonthlyReportModal } from './MonthlyReportModal';

export function InsightsCard() {
  const {
    exercises,
    sets,
    workouts,
    bodyMeasurements,
    userSettings,
  } = useData();
  const { weightLbs: bodyWeightLbs } = useBodyWeight();

  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [monthlyReport, setMonthlyReport] = useState<MonthlyReport | null>(null);

  const input: InsightsInput = useMemo(() => ({
    exercises,
    sets,
    workouts,
    bodyMeasurements,
    userSettings,
    bodyWeightLbs,
    nutritionHistory: new Map(),
    sleepHistory: new Map(),
  }), [exercises, sets, workouts, bodyMeasurements, userSettings, bodyWeightLbs]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const result = await getCachedInsights(input);
        if (!cancelled) {
          setInsights(result);
        }
      } catch (error) {
        console.error('[InsightsCard] Error loading insights:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [input]);

  const handleViewReport = useCallback(async () => {
    const lastMonth = format(subMonths(new Date(), 1), 'yyyy-MM');
    try {
      const report = await getCachedMonthlyReport(input, lastMonth);
      setMonthlyReport(report);
      setShowReport(true);
    } catch (error) {
      console.error('[InsightsCard] Error loading monthly report:', error);
    }
  }, [input]);

  // Show top 5 insights
  const displayInsights = insights.slice(0, 5);

  if (loading) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Insights</Text>
        <Card style={styles.loadingCard}>
          <ActivityIndicator size="small" color={colors.textSecondary} />
        </Card>
      </View>
    );
  }

  if (displayInsights.length === 0) return null;

  const categoryColors: Record<string, string> = {
    body_composition: '#4CAF50',
    strength_size: '#FF9800',
    nutrition_impact: '#FFC52F',
    phase_recommendation: '#5B8DEF',
    trend_prediction: '#9C27B0',
    smart_alert: '#DC2626',
    monthly_report: '#FFC52F',
  };

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Ionicons name="bulb-outline" size={18} color={colors.primary} />
        <Text style={styles.sectionTitle}>Insights</Text>
      </View>
      <Card padding="none">
        {displayInsights.map((insight, index) => {
          const isExpanded = expandedId === insight.id;
          const isFirst = index === 0;
          const isLast = index === displayInsights.length - 1;
          const accentColor = categoryColors[insight.category] || colors.primary;

          return (
            <TouchableOpacity
              key={insight.id}
              style={[
                styles.row,
                isFirst && styles.rowFirst,
                isLast && styles.rowLast,
                !isLast && styles.rowBorder,
              ]}
              onPress={() => setExpandedId(isExpanded ? null : insight.id)}
              activeOpacity={0.7}
            >
              <View style={styles.iconContainer}>
                <Ionicons
                  name={insight.icon as any}
                  size={20}
                  color={accentColor}
                />
              </View>
              <View style={styles.textContainer}>
                <Text style={styles.title} numberOfLines={isExpanded ? undefined : 2}>
                  {insight.title}
                </Text>
                {isExpanded && (
                  <Text style={styles.detail}>{insight.detail}</Text>
                )}
                {!isExpanded && (
                  <View style={styles.categoryBadge}>
                    <Text style={[styles.categoryText, { color: accentColor }]}>
                      {insight.category.replace(/_/g, ' ')}
                    </Text>
                  </View>
                )}
              </View>
              <Ionicons
                name={isExpanded ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={colors.textTertiary}
                style={styles.chevron}
              />
            </TouchableOpacity>
          );
        })}

        <TouchableOpacity
          style={styles.reportButton}
          onPress={handleViewReport}
        >
          <Ionicons name="document-text-outline" size={16} color={colors.primary} />
          <Text style={styles.reportButtonText}>View Monthly Report</Text>
        </TouchableOpacity>
      </Card>

      <MonthlyReportModal
        visible={showReport}
        onClose={() => setShowReport(false)}
        report={monthlyReport}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.text,
  },
  loadingCard: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
  },
  rowFirst: {
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
  },
  rowLast: {
    borderBottomLeftRadius: borderRadius.lg,
    borderBottomRightRadius: borderRadius.lg,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  iconContainer: {
    width: 32,
    alignItems: 'center',
    paddingTop: 2,
  },
  textContainer: {
    flex: 1,
    marginRight: spacing.sm,
  },
  title: {
    fontSize: typography.size.sm,
    color: colors.text,
    fontWeight: typography.weight.medium,
    lineHeight: typography.size.sm * 1.5,
  },
  detail: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    lineHeight: typography.size.xs * 1.5,
  },
  categoryBadge: {
    marginTop: 2,
  },
  categoryText: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.medium,
    textTransform: 'capitalize',
  },
  chevron: {
    paddingTop: 2,
  },
  reportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },
  reportButtonText: {
    fontSize: typography.size.sm,
    color: colors.primary,
    fontWeight: typography.weight.medium,
  },
});

export default InsightsCard;
