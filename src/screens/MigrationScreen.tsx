import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, borderRadius } from '../theme';
import { Button } from '../components/common';
import { migrateLocalDataToSupabase, getMigrationStats } from '../services/cloudSync';

interface MigrationScreenProps {
  onComplete: () => void;
}

export function MigrationScreen({ onComplete }: MigrationScreenProps) {
  const [status, setStatus] = useState<'checking' | 'ready' | 'migrating' | 'done' | 'error'>('checking');
  const [stats, setStats] = useState<{
    exercises: number;
    templates: number;
    workouts: number;
    sets: number;
    supplements: number;
    routines: number;
  } | null>(null);
  const [migrationCounts, setMigrationCounts] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [progress, setProgress] = useState<string>('');

  useEffect(() => {
    checkMigration();
  }, []);

  const checkMigration = async () => {
    try {
      const result = await getMigrationStats();
      if (result.isMigrated) {
        // Already migrated, skip this screen
        onComplete();
        return;
      }
      setStats(result.localCounts);
      setStatus('ready');
    } catch (error) {
      console.error('Migration check error:', error);
      // If we can't check, just let them through
      onComplete();
    }
  };

  const startMigration = async () => {
    setStatus('migrating');
    setProgress('Uploading your data to the cloud...');

    try {
      const result = await migrateLocalDataToSupabase();

      if (result.success) {
        setMigrationCounts(result.counts);
        setStatus('done');
      } else {
        setErrorMessage(result.error || 'Unknown error');
        setStatus('error');
      }
    } catch (error: any) {
      setErrorMessage(error.message || 'Unknown error');
      setStatus('error');
    }
  };

  const handleSkip = () => {
    Alert.alert(
      'Skip Backup?',
      'Your data will remain on this device only. You can sync it later from Settings.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Skip', onPress: onComplete },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {status === 'checking' && (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.statusText}>Checking your data...</Text>
          </View>
        )}

        {status === 'ready' && stats && (
          <View style={styles.content}>
            <Text style={styles.title}>Back Up Your Data</Text>
            <Text style={styles.description}>
              You have existing workout data on this device. Let's back it up to the cloud so you never lose it.
            </Text>

            <View style={styles.statsCard}>
              <Text style={styles.statsTitle}>Your Data</Text>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Exercises</Text>
                <Text style={styles.statValue}>{stats.exercises}</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Templates</Text>
                <Text style={styles.statValue}>{stats.templates}</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Workouts</Text>
                <Text style={styles.statValue}>{stats.workouts}</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Sets Logged</Text>
                <Text style={styles.statValue}>{stats.sets.toLocaleString()}</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Supplements</Text>
                <Text style={styles.statValue}>{stats.supplements}</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Routines</Text>
                <Text style={styles.statValue}>{stats.routines}</Text>
              </View>
            </View>

            <Button
              title="Back Up Now"
              onPress={startMigration}
              size="large"
              fullWidth
            />

            <View style={styles.skipContainer}>
              <Text style={styles.skipLink} onPress={handleSkip}>
                Skip for now
              </Text>
            </View>
          </View>
        )}

        {status === 'migrating' && (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.statusText}>{progress}</Text>
            <Text style={styles.subStatusText}>
              This may take a minute for large datasets.
            </Text>
          </View>
        )}

        {status === 'done' && migrationCounts && (
          <View style={styles.content}>
            <Text style={styles.successEmoji}>✅</Text>
            <Text style={styles.title}>Backup Complete!</Text>
            <Text style={styles.description}>
              Your data is now safely stored in the cloud.
            </Text>

            <View style={styles.statsCard}>
              <Text style={styles.statsTitle}>Uploaded</Text>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Exercises</Text>
                <Text style={styles.statValue}>{migrationCounts.exercises}</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Templates</Text>
                <Text style={styles.statValue}>{migrationCounts.templates}</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Workouts</Text>
                <Text style={styles.statValue}>{migrationCounts.workouts}</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Sets</Text>
                <Text style={styles.statValue}>{migrationCounts.sets.toLocaleString()}</Text>
              </View>
            </View>

            <Button
              title="Continue to App"
              onPress={onComplete}
              size="large"
              fullWidth
            />
          </View>
        )}

        {status === 'error' && (
          <View style={styles.content}>
            <Text style={styles.errorEmoji}>⚠️</Text>
            <Text style={styles.title}>Backup Failed</Text>
            <Text style={styles.description}>
              {errorMessage || 'Something went wrong. Your local data is still safe.'}
            </Text>

            <Button
              title="Try Again"
              onPress={startMigration}
              size="large"
              fullWidth
            />

            <View style={styles.skipContainer}>
              <Text style={styles.skipLink} onPress={onComplete}>
                Continue without backup
              </Text>
            </View>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  centered: {
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
  },
  title: {
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  description: {
    fontSize: typography.size.base,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
    lineHeight: 22,
  },
  statusText: {
    fontSize: typography.size.lg,
    color: colors.text,
    marginTop: spacing.lg,
  },
  subStatusText: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  statsCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    width: '100%',
    marginBottom: spacing.xl,
  },
  statsTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.surfaceLight,
  },
  statLabel: {
    fontSize: typography.size.base,
    color: colors.textSecondary,
  },
  statValue: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: colors.primary,
  },
  skipContainer: {
    marginTop: spacing.lg,
  },
  skipLink: {
    fontSize: typography.size.sm,
    color: colors.textTertiary,
    textDecorationLine: 'underline',
  },
  successEmoji: {
    fontSize: 48,
    marginBottom: spacing.lg,
  },
  errorEmoji: {
    fontSize: 48,
    marginBottom: spacing.lg,
  },
});

export default MigrationScreen;
