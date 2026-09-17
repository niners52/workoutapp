/**
 * Detail behind the Tier 1 tiles: today's synced nutrition row, where it came
 * from, the recent days, and why calcium is missing when it is.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { useRoute, RouteProp } from '@react-navigation/native';
import { format, parseISO } from 'date-fns';
import { colors, typography, spacing } from '../theme';
import { Button, Card } from '../components/common';
import { useData } from '../contexts/DataContext';
import { dayVerdict, formatInt } from '../services/healthDashboard';
import { loadNutrition, type NutritionLoad } from '../services/healthDashboardData';
import { syncNutritionFromHealthKit } from '../services/nutritionSync';
import type { NutritionDayRow } from '../services/syncService';
import { DEFAULT_HEALTH_TARGETS } from '../types';
import { RootStackParamList } from '../navigation/types';

type NutritionTodayRoute = RouteProp<RootStackParamList, 'NutritionToday'>;

const NUTRIENTS: ReadonlyArray<{ key: keyof NutritionDayRow; label: string; unit: string }> = [
  { key: 'sodium_mg', label: 'Sodium', unit: 'mg' },
  { key: 'calcium_mg', label: 'Calcium', unit: 'mg' },
  { key: 'protein_g', label: 'Protein', unit: 'g' },
  { key: 'calories', label: 'Calories', unit: 'kcal' },
  { key: 'carbs_g', label: 'Carbs', unit: 'g' },
  { key: 'fat_g', label: 'Fat', unit: 'g' },
  { key: 'fiber_g', label: 'Fiber', unit: 'g' },
  { key: 'iron_mg', label: 'Iron', unit: 'mg' },
  { key: 'vitamin_b12_mcg', label: 'Vitamin B12', unit: 'mcg' },
  { key: 'vitamin_d_iu', label: 'Vitamin D', unit: 'IU' },
  { key: 'zinc_mg', label: 'Zinc', unit: 'mg' },
];

function CalciumFix() {
  return (
    <Card style={styles.card}>
      <Text style={styles.cardTitle}>Why calcium isn’t syncing</Text>
      <Text style={styles.body}>
        The calcium reader was added to the app’s Apple Health library on Sep 13. The build installed on this
        phone is older, and an over-the-air update cannot add native code, so every calcium read comes back empty.
      </Text>
      <Text style={styles.body}>To fix it:</Text>
      <Text style={styles.step}>1. Install a new native build of the app (EAS build, then TestFlight).</Text>
      <Text style={styles.step}>2. Open the app. When Apple Health asks, allow Calcium (and the other nutrients).</Text>
      <Text style={styles.step}>
        3. If no prompt appears: Settings → Health → Data Access & Devices → this app → turn on Calcium.
      </Text>
      <Text style={styles.body}>Pull to refresh on Home afterwards; the calcium tile lights up on that sync.</Text>
    </Card>
  );
}

export function NutritionTodayScreen() {
  const route = useRoute<NutritionTodayRoute>();
  const { userSettings } = useData();
  const targets = userSettings.healthTargets ?? DEFAULT_HEALTH_TARGETS;
  const [data, setData] = useState<NutritionLoad | null>(null);
  const [syncing, setSyncing] = useState(false);

  const reload = useCallback(async () => setData(await loadNutrition(new Date())), []);
  useEffect(() => {
    reload();
  }, [reload]);

  const syncNow = async () => {
    setSyncing(true);
    try {
      const result = await syncNutritionFromHealthKit(true);
      if (result.skipped === 'not_ios') Alert.alert('Apple Health is only available on iPhone');
    } catch (e) {
      Alert.alert('Sync failed', e instanceof Error ? e.message : String(e));
    }
    await reload();
    setSyncing(false);
  };

  const today = data?.today ?? null;
  const todayKey = format(new Date(), 'yyyy-MM-dd');
  const calciumBroken =
    data?.unavailable.includes('calcium_mg') || (data?.latestLogged ? data.latestLogged.calcium_mg === null : false);
  const calciumFirst = route.params?.focus === 'calcium' && calciumBroken;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {calciumFirst && <CalciumFix />}

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Today{today ? ` · ${today.sample_count} entries` : ''}</Text>
        {!data ? (
          <Text style={styles.body}>Loading…</Text>
        ) : !today ? (
          <Text style={styles.body}>Nothing logged today yet. Values appear after Cronometer writes to Apple Health and the app syncs.</Text>
        ) : (
          NUTRIENTS.map(n => {
            const value = today[n.key];
            return (
              <View key={n.key} style={styles.row}>
                <Text style={styles.rowLabel}>{n.label}</Text>
                <Text style={[styles.rowValue, value === null && styles.rowMissing]}>
                  {value === null ? 'not readable in this build' : `${formatInt(Number(value))} ${n.unit}`}
                </Text>
              </View>
            );
          })
        )}
        {today?.last_sample_at && <Text style={styles.meta}>Last entry {format(new Date(today.last_sample_at), 'h:mm a')}</Text>}
        {data && (
          <Text style={styles.meta}>
            {data.syncedAt ? `Synced ${format(new Date(data.syncedAt), 'MMM d, h:mm a')}` : 'Not synced yet'}
            {data.source === 'cloud' ? ' · read from the cloud' : data.source === 'phone' ? ' · from this phone’s last sync' : ''}
          </Text>
        )}
        {data?.error && <Text style={[styles.meta, { color: colors.warning }]}>Could not load: {data.error}</Text>}
        <Button title="Sync from Apple Health now" onPress={syncNow} loading={syncing} variant="secondary" style={styles.button} />
      </Card>

      {calciumBroken && !calciumFirst && <CalciumFix />}

      {data && data.recent.length > 0 && (
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Recent days</Text>
          <Text style={styles.body}>
            A complete day is green only when all five rules are met: calories in band, protein and fat at their floors,
            sodium inside the budget, calcium in band.
          </Text>
          {data.recent.slice(0, 7).map(day => {
            const verdict = dayVerdict(day, targets, todayKey);
            const tone =
              verdict.kind !== 'verdict' ? colors.textTertiary : verdict.tone === 'good' ? colors.healthGood : colors.warning;
            return (
              <View key={day.date} style={styles.verdictRow}>
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>{format(parseISO(day.date), 'EEE, MMM d')}</Text>
                  <Text style={[styles.rowValue, { color: tone }]}>{verdict.headline}</Text>
                </View>
                <Text style={styles.verdictDetail}>{verdict.detail}</Text>
              </View>
            );
          })}
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.base,
    paddingBottom: spacing.xxxl,
  },
  card: {
    marginBottom: spacing.base,
  },
  cardTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  body: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  step: {
    fontSize: typography.size.sm,
    color: colors.text,
    lineHeight: 20,
    marginBottom: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  rowLabel: {
    fontSize: typography.size.base,
    color: colors.text,
  },
  rowValue: {
    fontSize: typography.size.base,
    color: colors.text,
    fontWeight: typography.weight.medium,
  },
  rowMissing: {
    color: colors.textTertiary,
    fontWeight: typography.weight.regular,
    fontSize: typography.size.sm,
  },
  verdictRow: {
    paddingVertical: spacing.xs,
  },
  verdictDetail: {
    fontSize: typography.size.xs,
    color: colors.textTertiary,
  },
  meta: {
    fontSize: typography.size.xs,
    color: colors.textTertiary,
    marginTop: spacing.sm,
  },
  button: {
    marginTop: spacing.md,
  },
});

export default NutritionTodayScreen;
