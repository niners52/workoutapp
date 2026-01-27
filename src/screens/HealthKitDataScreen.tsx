import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { colors, typography, spacing, borderRadius, commonStyles } from '../theme';
import { Card } from '../components/common';

// Conditionally import HealthKit
let AppleHealthKit: any = null;
if (Platform.OS === 'ios') {
  try {
    const healthModule = require('react-native-health');
    AppleHealthKit = healthModule.default || healthModule;
  } catch (e) {
    console.log('HealthKit not available:', e);
  }
}

interface DataSection {
  title: string;
  type: string;
  data: any[];
  error: string | null;
  loading: boolean;
}

interface RawSample {
  id?: string;
  value?: number;
  startDate: string;
  endDate: string;
  sourceName?: string;
  sourceId?: string;
  unit?: string;
  metadata?: any;
}

// Data types we want to query
const DATA_TYPES = [
  { title: 'Protein', type: 'Protein', unit: 'g' },
  { title: 'Carbohydrates', type: 'Carbohydrates', unit: 'g' },
  { title: 'Fat (Total)', type: 'FatTotal', unit: 'g' },
  { title: 'Calories (Dietary)', type: 'EnergyConsumed', unit: 'kcal' },
  { title: 'Active Energy Burned', type: 'ActiveEnergyBurned', unit: 'kcal' },
  { title: 'Sleep Analysis', type: 'SleepAnalysis', unit: '' },
  { title: 'Workouts', type: 'Workout', unit: '' },
  { title: 'Steps', type: 'StepCount', unit: 'steps' },
  { title: 'Weight', type: 'Weight', unit: 'lb' },
  { title: 'Heart Rate', type: 'HeartRate', unit: 'bpm' },
  { title: 'Dietary Water', type: 'DietaryWater', unit: 'ml' },
  { title: 'Caffeine', type: 'Caffeine', unit: 'mg' },
  { title: 'Fiber', type: 'Fiber', unit: 'g' },
  { title: 'Sugar', type: 'Sugar', unit: 'g' },
];

export function HealthKitDataScreen() {
  const navigation = useNavigation();
  const [refreshing, setRefreshing] = useState(false);
  const [healthKitStatus, setHealthKitStatus] = useState<'checking' | 'available' | 'unavailable' | 'error'>('checking');
  const [statusMessage, setStatusMessage] = useState('');
  const [sections, setSections] = useState<DataSection[]>(
    DATA_TYPES.map(dt => ({
      title: dt.title,
      type: dt.type,
      data: [],
      error: null,
      loading: true,
    }))
  );
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [daysBack, setDaysBack] = useState(7);
  const isLoadingRef = useRef(false);
  const isMountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const initHealthKit = useCallback(async (): Promise<boolean> => {
    if (Platform.OS !== 'ios') {
      setHealthKitStatus('unavailable');
      setStatusMessage('Not iOS - HealthKit unavailable');
      return false;
    }

    if (!AppleHealthKit) {
      setHealthKitStatus('unavailable');
      setStatusMessage('react-native-health module not loaded');
      return false;
    }

    return new Promise((resolve) => {
      const permissions = {
        permissions: {
          read: [
            'Workout',
            'ActiveEnergyBurned',
            'SleepAnalysis',
            'Protein',
            'Carbohydrates',
            'FatTotal',
            'EnergyConsumed',
            'StepCount',
            'Weight',
            'HeartRate',
            'DietaryWater',
            'Caffeine',
            'Fiber',
            'Sugar',
          ],
          write: [],
        },
      };

      AppleHealthKit.initHealthKit(permissions, (error: string) => {
        if (error) {
          setHealthKitStatus('error');
          setStatusMessage(`Init error: ${error}`);
          resolve(false);
        } else {
          setHealthKitStatus('available');
          setStatusMessage('HealthKit initialized successfully');
          resolve(true);
        }
      });
    });
  }, []);

  const fetchDataForType = useCallback(async (dataType: typeof DATA_TYPES[0]): Promise<DataSection> => {
    const baseSection: DataSection = {
      title: dataType.title,
      type: dataType.type,
      data: [],
      error: null,
      loading: false,
    };

    if (!AppleHealthKit) {
      return { ...baseSection, error: 'HealthKit not available' };
    }

    try {
      const startDate = startOfDay(subDays(new Date(), daysBack));
      const endDate = endOfDay(new Date());

      const options = {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        ascending: false,
        limit: 50, // Reduced limit to prevent memory issues
      };

      // Map data types to their specific getter methods
      const nutritionMethods: Record<string, string> = {
        'Protein': 'getProteinSamples',
        'Carbohydrates': 'getCarbohydratesSamples',
        'FatTotal': 'getTotalFatSamples',
        'EnergyConsumed': 'getEnergyConsumedSamples',
        'DietaryWater': 'getWaterSamples',
        'Caffeine': 'getCaffeineSamples',
        'Fiber': 'getFiberSamples',
        'Sugar': 'getSugarSamples',
      };

      return new Promise((resolve) => {
        // Timeout after 5 seconds to prevent hanging
        const timeoutId = setTimeout(() => {
          resolve({ ...baseSection, error: 'Timeout - no response from HealthKit' });
        }, 5000);

        const callback = (err: string | null, results: any[]) => {
          clearTimeout(timeoutId);
          if (!isMountedRef.current) return;
          if (err) {
            resolve({ ...baseSection, error: String(err) });
          } else {
            resolve({ ...baseSection, data: results || [] });
          }
        };

        try {
          // Special handling for different data types
          if (dataType.type === 'SleepAnalysis') {
            if (typeof AppleHealthKit.getSleepSamples === 'function') {
              AppleHealthKit.getSleepSamples(options, callback);
            } else {
              clearTimeout(timeoutId);
              resolve({ ...baseSection, error: 'getSleepSamples not available' });
            }
          } else if (dataType.type === 'Workout') {
            if (typeof AppleHealthKit.getSamples === 'function') {
              AppleHealthKit.getSamples({ ...options, type: 'Workout' }, callback);
            } else {
              clearTimeout(timeoutId);
              resolve({ ...baseSection, error: 'getSamples not available' });
            }
          } else if (dataType.type === 'StepCount') {
            if (typeof AppleHealthKit.getDailyStepCountSamples === 'function') {
              AppleHealthKit.getDailyStepCountSamples(options, callback);
            } else {
              clearTimeout(timeoutId);
              resolve({ ...baseSection, error: 'getDailyStepCountSamples not available' });
            }
          } else if (dataType.type === 'Weight') {
            if (typeof AppleHealthKit.getWeightSamples === 'function') {
              AppleHealthKit.getWeightSamples(options, callback);
            } else {
              clearTimeout(timeoutId);
              resolve({ ...baseSection, error: 'getWeightSamples not available' });
            }
          } else if (dataType.type === 'HeartRate') {
            if (typeof AppleHealthKit.getHeartRateSamples === 'function') {
              AppleHealthKit.getHeartRateSamples(options, callback);
            } else {
              clearTimeout(timeoutId);
              resolve({ ...baseSection, error: 'getHeartRateSamples not available' });
            }
          } else if (dataType.type === 'ActiveEnergyBurned') {
            if (typeof AppleHealthKit.getActiveEnergyBurned === 'function') {
              AppleHealthKit.getActiveEnergyBurned(options, callback);
            } else {
              clearTimeout(timeoutId);
              resolve({ ...baseSection, error: 'getActiveEnergyBurned not available' });
            }
          } else if (nutritionMethods[dataType.type]) {
            // Use specific nutrition method if available
            const methodName = nutritionMethods[dataType.type];
            if (typeof AppleHealthKit[methodName] === 'function') {
              AppleHealthKit[methodName](options, callback);
            } else {
              // Fallback to getSamples with type
              if (typeof AppleHealthKit.getSamples === 'function') {
                AppleHealthKit.getSamples({ ...options, type: dataType.type }, callback);
              } else {
                clearTimeout(timeoutId);
                resolve({ ...baseSection, error: `${methodName} not available` });
              }
            }
          } else {
            // Generic fallback
            if (typeof AppleHealthKit.getSamples === 'function') {
              AppleHealthKit.getSamples({ ...options, type: dataType.type }, callback);
            } else {
              clearTimeout(timeoutId);
              resolve({ ...baseSection, error: 'getSamples not available' });
            }
          }
        } catch (innerError) {
          clearTimeout(timeoutId);
          resolve({ ...baseSection, error: `Call error: ${innerError}` });
        }
      });
    } catch (error) {
      return { ...baseSection, error: `Exception: ${error}` };
    }
  }, [daysBack]);

  const loadAllData = useCallback(async () => {
    // Prevent multiple simultaneous loads
    if (isLoadingRef.current) {
      console.log('Already loading, skipping...');
      return;
    }
    isLoadingRef.current = true;

    try {
      const initialized = await initHealthKit();
      if (!isMountedRef.current) return;

      if (!initialized) {
        setSections(prev => prev.map(s => ({ ...s, loading: false, error: 'HealthKit not initialized' })));
        return;
      }

      // Load data for all types sequentially to avoid overwhelming the system
      const results: DataSection[] = [];
      for (const dt of DATA_TYPES) {
        if (!isMountedRef.current) break;

        try {
          const result = await fetchDataForType(dt);
          results.push(result);
          // Update sections incrementally so user sees progress
          if (isMountedRef.current) {
            setSections([...results, ...DATA_TYPES.slice(results.length).map(d => ({
              title: d.title,
              type: d.type,
              data: [],
              error: null,
              loading: true,
            }))]);
          }
        } catch (error) {
          results.push({
            title: dt.title,
            type: dt.type,
            data: [],
            error: `Failed: ${error}`,
            loading: false,
          });
        }
      }
      if (isMountedRef.current) {
        setSections(results);
      }
    } catch (error) {
      console.log('loadAllData error:', error);
      if (isMountedRef.current) {
        setSections(prev => prev.map(s => ({ ...s, loading: false, error: `Load error: ${error}` })));
      }
    } finally {
      isLoadingRef.current = false;
    }
  }, [initHealthKit, fetchDataForType]);

  // Load data on mount only
  useEffect(() => {
    loadAllData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    isLoadingRef.current = false; // Allow a new load
    await loadAllData();
    if (isMountedRef.current) {
      setRefreshing(false);
    }
  }, [loadAllData]);

  // Reload when daysBack changes
  useEffect(() => {
    // Skip the initial mount (handled by the other useEffect)
    if (daysBack !== 7) {
      isLoadingRef.current = false; // Allow a new load
      setSections(prev => prev.map(s => ({ ...s, loading: true })));
      loadAllData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daysBack]);

  const toggleSection = (type: string) => {
    setExpandedSection(prev => prev === type ? null : type);
  };

  const formatSampleValue = (sample: RawSample, type: string): string => {
    if (type === 'SleepAnalysis') {
      return sample.value || 'Unknown stage';
    }
    if (type === 'Workout') {
      return (sample as any).activityName || 'Workout';
    }
    if (sample.value !== undefined) {
      return sample.value.toFixed(1);
    }
    return 'N/A';
  };

  const formatDate = (dateStr: string): string => {
    try {
      return format(new Date(dateStr), 'MMM d, h:mm a');
    } catch {
      return dateStr;
    }
  };

  const getSourceSummary = (data: any[]): Map<string, number> => {
    const sources = new Map<string, number>();
    data.forEach(sample => {
      const source = sample.sourceName || 'Unknown';
      sources.set(source, (sources.get(source) || 0) + 1);
    });
    return sources;
  };

  const getTotalValue = (data: any[]): number => {
    return data.reduce((sum, sample) => sum + (sample.value || 0), 0);
  };

  return (
    <SafeAreaView style={commonStyles.safeArea} edges={['top']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.text}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.backButton}>{'< Back'}</Text>
          </TouchableOpacity>
          <Text style={styles.title}>HealthKit Data</Text>
          <Text style={styles.subtitle}>Raw data for debugging</Text>
        </View>

        {/* Status Card */}
        <Card>
          <Text style={styles.cardTitle}>HealthKit Status</Text>
          <View style={styles.statusRow}>
            <View style={[
              styles.statusDot,
              healthKitStatus === 'available' && styles.statusDotGreen,
              healthKitStatus === 'unavailable' && styles.statusDotRed,
              healthKitStatus === 'error' && styles.statusDotYellow,
              healthKitStatus === 'checking' && styles.statusDotGray,
            ]} />
            <Text style={styles.statusText}>
              {healthKitStatus === 'checking' ? 'Checking...' :
               healthKitStatus === 'available' ? 'Connected' :
               healthKitStatus === 'unavailable' ? 'Unavailable' : 'Error'}
            </Text>
          </View>
          <Text style={styles.statusMessage}>{statusMessage}</Text>
          <Text style={styles.platformInfo}>Platform: {Platform.OS}</Text>
        </Card>

        {/* Days Selector */}
        <Card>
          <Text style={styles.cardTitle}>Date Range</Text>
          <View style={styles.daysRow}>
            {[1, 3, 7, 14, 30].map(days => (
              <TouchableOpacity
                key={days}
                style={[styles.dayButton, daysBack === days && styles.dayButtonActive]}
                onPress={() => setDaysBack(days)}
              >
                <Text style={[styles.dayButtonText, daysBack === days && styles.dayButtonTextActive]}>
                  {days}d
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        {/* Data Sections */}
        {sections.map(section => {
          const isExpanded = expandedSection === section.type;
          const dataType = DATA_TYPES.find(dt => dt.type === section.type);
          const sourceSummary = getSourceSummary(section.data);
          const totalValue = getTotalValue(section.data);

          return (
            <Card key={section.type} padding="none">
              <TouchableOpacity
                style={styles.sectionHeader}
                onPress={() => toggleSection(section.type)}
                activeOpacity={0.7}
              >
                <View style={styles.sectionHeaderLeft}>
                  <Text style={styles.sectionTitle}>{section.title}</Text>
                  <Text style={styles.sectionCount}>
                    {section.loading ? 'Loading...' :
                     section.error ? 'Error' :
                     `${section.data.length} samples`}
                  </Text>
                </View>
                <View style={styles.sectionHeaderRight}>
                  {!section.loading && !section.error && section.data.length > 0 && (
                    <Text style={styles.sectionTotal}>
                      {totalValue.toFixed(0)} {dataType?.unit}
                    </Text>
                  )}
                  <Text style={styles.expandIcon}>{isExpanded ? '−' : '+'}</Text>
                </View>
              </TouchableOpacity>

              {section.loading && (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="small" color={colors.primary} />
                </View>
              )}

              {section.error && (
                <View style={styles.errorContainer}>
                  <Text style={styles.errorText}>{section.error}</Text>
                </View>
              )}

              {isExpanded && !section.loading && !section.error && (
                <View style={styles.sectionContent}>
                  {/* Source Summary */}
                  {sourceSummary.size > 0 && (
                    <View style={styles.sourcesSummary}>
                      <Text style={styles.sourcesLabel}>Sources:</Text>
                      {Array.from(sourceSummary.entries()).map(([source, count]) => (
                        <View key={source} style={styles.sourceChip}>
                          <Text style={styles.sourceChipText}>{source}: {count}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Sample List */}
                  {section.data.length === 0 ? (
                    <Text style={styles.noDataText}>No data found for this period</Text>
                  ) : (
                    section.data.slice(0, 20).map((sample, index) => (
                      <View key={sample.id || index} style={styles.sampleRow}>
                        <View style={styles.sampleInfo}>
                          <Text style={styles.sampleValue}>
                            {formatSampleValue(sample, section.type)} {dataType?.unit}
                          </Text>
                          <Text style={styles.sampleDate}>
                            {formatDate(sample.startDate || sample.start)}
                          </Text>
                        </View>
                        <Text style={styles.sampleSource} numberOfLines={1}>
                          {sample.sourceName || 'Unknown'}
                        </Text>
                      </View>
                    ))
                  )}

                  {section.data.length > 20 && (
                    <Text style={styles.moreText}>
                      +{section.data.length - 20} more samples
                    </Text>
                  )}
                </View>
              )}
            </Card>
          );
        })}

        {/* Debug Info */}
        <Card>
          <Text style={styles.cardTitle}>Debug Info</Text>
          <Text style={styles.debugText}>
            AppleHealthKit loaded: {AppleHealthKit ? 'Yes' : 'No'}
          </Text>
          {AppleHealthKit && (
            <Text style={styles.debugText}>
              Available methods: {Object.keys(AppleHealthKit).filter(k => typeof AppleHealthKit[k] === 'function').length}
            </Text>
          )}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.base,
    paddingBottom: spacing.xxl,
  },
  header: {
    marginBottom: spacing.lg,
  },
  backButton: {
    fontSize: typography.size.md,
    color: colors.primary,
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold,
    color: colors.text,
  },
  subtitle: {
    fontSize: typography.size.base,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  cardTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  statusDotGreen: {
    backgroundColor: colors.success,
  },
  statusDotRed: {
    backgroundColor: colors.error,
  },
  statusDotYellow: {
    backgroundColor: colors.warning,
  },
  statusDotGray: {
    backgroundColor: colors.textTertiary,
  },
  statusText: {
    fontSize: typography.size.base,
    color: colors.text,
  },
  statusMessage: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  platformInfo: {
    fontSize: typography.size.sm,
    color: colors.textTertiary,
    marginTop: spacing.xs,
  },
  daysRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  dayButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.backgroundTertiary,
  },
  dayButtonActive: {
    backgroundColor: colors.primary,
  },
  dayButtonText: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    fontWeight: typography.weight.medium,
  },
  dayButtonTextActive: {
    color: colors.text,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.base,
  },
  sectionHeaderLeft: {
    flex: 1,
  },
  sectionHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  sectionTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.medium,
    color: colors.text,
  },
  sectionCount: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  sectionTotal: {
    fontSize: typography.size.sm,
    color: colors.primary,
    fontWeight: typography.weight.medium,
  },
  expandIcon: {
    fontSize: typography.size.xl,
    color: colors.textTertiary,
  },
  sectionContent: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
    padding: spacing.base,
  },
  loadingContainer: {
    padding: spacing.md,
    alignItems: 'center',
  },
  errorContainer: {
    padding: spacing.base,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },
  errorText: {
    fontSize: typography.size.sm,
    color: colors.error,
  },
  sourcesSummary: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  sourcesLabel: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  sourceChip: {
    backgroundColor: colors.backgroundTertiary,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  sourceChipText: {
    fontSize: typography.size.xs,
    color: colors.text,
  },
  noDataText: {
    fontSize: typography.size.sm,
    color: colors.textTertiary,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  sampleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  sampleInfo: {
    flex: 1,
  },
  sampleValue: {
    fontSize: typography.size.base,
    color: colors.text,
    fontWeight: typography.weight.medium,
  },
  sampleDate: {
    fontSize: typography.size.xs,
    color: colors.textTertiary,
    marginTop: 2,
  },
  sampleSource: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    maxWidth: 100,
    textAlign: 'right',
  },
  moreText: {
    fontSize: typography.size.sm,
    color: colors.textTertiary,
    textAlign: 'center',
    paddingTop: spacing.md,
  },
  debugText: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});

export default HealthKitDataScreen;
