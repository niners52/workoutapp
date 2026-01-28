import React, { useState, useCallback, useRef, Component, ErrorInfo, ReactNode } from 'react';
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
import { Card, Button } from '../components/common';

// Error Boundary to catch any crashes
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class HealthKitErrorBoundary extends Component<{ children: ReactNode; onReset: () => void }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode; onReset: () => void }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.log('HealthKit Error Boundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <SafeAreaView style={commonStyles.safeArea}>
          <View style={boundaryStyles.container}>
            <Text style={boundaryStyles.title}>HealthKit Screen Error</Text>
            <Text style={boundaryStyles.message}>
              {this.state.error?.message || 'An unexpected error occurred'}
            </Text>
            <TouchableOpacity
              style={boundaryStyles.button}
              onPress={() => {
                this.setState({ hasError: false, error: null });
                this.props.onReset();
              }}
            >
              <Text style={boundaryStyles.buttonText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      );
    }
    return this.props.children;
  }
}

const boundaryStyles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: colors.background,
  },
  title: {
    fontSize: 18,
    color: colors.error,
    marginBottom: 10,
    fontWeight: '600',
  },
  message: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 20,
  },
  button: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  buttonText: {
    color: colors.text,
    fontWeight: '600',
  },
});

// Conditionally import HealthKit - with extra safety
let AppleHealthKit: any = null;
try {
  if (Platform.OS === 'ios') {
    const healthModule = require('react-native-health');
    AppleHealthKit = healthModule?.default || healthModule;
  }
} catch (e) {
  console.log('HealthKit not available:', e);
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

function HealthKitDataScreenContent() {
  const navigation = useNavigation();
  const [refreshing, setRefreshing] = useState(false);
  const [healthKitStatus, setHealthKitStatus] = useState<'idle' | 'checking' | 'available' | 'unavailable' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState('Press "Load Data" to fetch HealthKit data');
  const [hasStartedLoading, setHasStartedLoading] = useState(false);
  const [sections, setSections] = useState<DataSection[]>(
    DATA_TYPES.map(dt => ({
      title: dt.title,
      type: dt.type,
      data: [],
      error: null,
      loading: false,
    }))
  );
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [daysBack, setDaysBack] = useState(7);
  const isLoadingRef = useRef(false);
  const isMountedRef = useRef(true);

  // Cleanup on unmount
  React.useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const initHealthKit = useCallback(async (): Promise<boolean> => {
    try {
      if (Platform.OS !== 'ios') {
        if (isMountedRef.current) {
          setHealthKitStatus('unavailable');
          setStatusMessage('Not iOS - HealthKit unavailable');
        }
        return false;
      }

      if (!AppleHealthKit) {
        if (isMountedRef.current) {
          setHealthKitStatus('unavailable');
          setStatusMessage('react-native-health module not loaded');
        }
        return false;
      }

      if (typeof AppleHealthKit.initHealthKit !== 'function') {
        if (isMountedRef.current) {
          setHealthKitStatus('unavailable');
          setStatusMessage('initHealthKit method not available');
        }
        return false;
      }

      return new Promise((resolve) => {
        const timeoutId = setTimeout(() => {
          if (isMountedRef.current) {
            setHealthKitStatus('error');
            setStatusMessage('Timeout waiting for HealthKit initialization');
          }
          resolve(false);
        }, 10000);

        try {
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
            clearTimeout(timeoutId);
            if (!isMountedRef.current) return;

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
        } catch (e) {
          clearTimeout(timeoutId);
          if (isMountedRef.current) {
            setHealthKitStatus('error');
            setStatusMessage(`Init exception: ${e}`);
          }
          resolve(false);
        }
      });
    } catch (e) {
      if (isMountedRef.current) {
        setHealthKitStatus('error');
        setStatusMessage(`Outer init exception: ${e}`);
      }
      return false;
    }
  }, []);

  const fetchDataForType = useCallback(async (dataType: typeof DATA_TYPES[0]): Promise<DataSection> => {
    const baseSection: DataSection = {
      title: dataType.title,
      type: dataType.type,
      data: [],
      error: null,
      loading: false,
    };

    try {
      if (!AppleHealthKit) {
        return { ...baseSection, error: 'HealthKit not available' };
      }

      const startDate = startOfDay(subDays(new Date(), daysBack));
      const endDate = endOfDay(new Date());

      const options = {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        ascending: false,
        limit: 30,
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
        const timeoutId = setTimeout(() => {
          resolve({ ...baseSection, error: 'Timeout' });
        }, 3000);

        const callback = (err: string | null, results: any[]) => {
          clearTimeout(timeoutId);
          if (!isMountedRef.current) {
            resolve(baseSection);
            return;
          }
          if (err) {
            resolve({ ...baseSection, error: String(err) });
          } else {
            resolve({ ...baseSection, data: results || [] });
          }
        };

        try {
          if (dataType.type === 'SleepAnalysis') {
            if (typeof AppleHealthKit.getSleepSamples === 'function') {
              AppleHealthKit.getSleepSamples(options, callback);
            } else {
              clearTimeout(timeoutId);
              resolve({ ...baseSection, error: 'Method not available' });
            }
          } else if (dataType.type === 'Workout') {
            if (typeof AppleHealthKit.getSamples === 'function') {
              AppleHealthKit.getSamples({ ...options, type: 'Workout' }, callback);
            } else {
              clearTimeout(timeoutId);
              resolve({ ...baseSection, error: 'Method not available' });
            }
          } else if (dataType.type === 'StepCount') {
            if (typeof AppleHealthKit.getDailyStepCountSamples === 'function') {
              AppleHealthKit.getDailyStepCountSamples(options, callback);
            } else {
              clearTimeout(timeoutId);
              resolve({ ...baseSection, error: 'Method not available' });
            }
          } else if (dataType.type === 'Weight') {
            if (typeof AppleHealthKit.getWeightSamples === 'function') {
              AppleHealthKit.getWeightSamples(options, callback);
            } else {
              clearTimeout(timeoutId);
              resolve({ ...baseSection, error: 'Method not available' });
            }
          } else if (dataType.type === 'HeartRate') {
            if (typeof AppleHealthKit.getHeartRateSamples === 'function') {
              AppleHealthKit.getHeartRateSamples(options, callback);
            } else {
              clearTimeout(timeoutId);
              resolve({ ...baseSection, error: 'Method not available' });
            }
          } else if (dataType.type === 'ActiveEnergyBurned') {
            if (typeof AppleHealthKit.getActiveEnergyBurned === 'function') {
              AppleHealthKit.getActiveEnergyBurned(options, callback);
            } else {
              clearTimeout(timeoutId);
              resolve({ ...baseSection, error: 'Method not available' });
            }
          } else if (nutritionMethods[dataType.type]) {
            const methodName = nutritionMethods[dataType.type];
            if (typeof AppleHealthKit[methodName] === 'function') {
              AppleHealthKit[methodName](options, callback);
            } else if (typeof AppleHealthKit.getSamples === 'function') {
              AppleHealthKit.getSamples({ ...options, type: dataType.type }, callback);
            } else {
              clearTimeout(timeoutId);
              resolve({ ...baseSection, error: 'Method not available' });
            }
          } else {
            if (typeof AppleHealthKit.getSamples === 'function') {
              AppleHealthKit.getSamples({ ...options, type: dataType.type }, callback);
            } else {
              clearTimeout(timeoutId);
              resolve({ ...baseSection, error: 'Method not available' });
            }
          }
        } catch (innerError) {
          clearTimeout(timeoutId);
          resolve({ ...baseSection, error: `Error: ${innerError}` });
        }
      });
    } catch (error) {
      return { ...baseSection, error: `Exception: ${error}` };
    }
  }, [daysBack]);

  const loadAllData = useCallback(async () => {
    if (isLoadingRef.current) {
      return;
    }
    isLoadingRef.current = true;

    try {
      if (isMountedRef.current) {
        setHasStartedLoading(true);
        setHealthKitStatus('checking');
        setStatusMessage('Initializing HealthKit...');
        setSections(prev => prev.map(s => ({ ...s, loading: true, error: null, data: [] })));
      }

      const initialized = await initHealthKit();
      if (!isMountedRef.current) return;

      if (!initialized) {
        setSections(prev => prev.map(s => ({ ...s, loading: false, error: 'HealthKit not initialized' })));
        return;
      }

      // Load data one at a time with delays
      const results: DataSection[] = [];
      for (let i = 0; i < DATA_TYPES.length; i++) {
        if (!isMountedRef.current) break;

        const dt = DATA_TYPES[i];
        try {
          const result = await fetchDataForType(dt);
          results.push(result);

          if (isMountedRef.current) {
            const remaining = DATA_TYPES.slice(i + 1).map(d => ({
              title: d.title,
              type: d.type,
              data: [],
              error: null,
              loading: true,
            }));
            setSections([...results, ...remaining]);
          }

          // Small delay between requests
          await new Promise(r => setTimeout(r, 100));
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
        setStatusMessage(`Load error: ${error}`);
        setSections(prev => prev.map(s => ({ ...s, loading: false, error: `Load error` })));
      }
    } finally {
      isLoadingRef.current = false;
    }
  }, [initHealthKit, fetchDataForType]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    isLoadingRef.current = false;
    await loadAllData();
    if (isMountedRef.current) {
      setRefreshing(false);
    }
  }, [loadAllData]);

  const handleLoadData = useCallback(() => {
    isLoadingRef.current = false;
    loadAllData();
  }, [loadAllData]);

  const toggleSection = (type: string) => {
    setExpandedSection(prev => prev === type ? null : type);
  };

  const formatSampleValue = (sample: RawSample, type: string): string => {
    try {
      if (type === 'SleepAnalysis') {
        // Sleep has value like "CORE", "REM", "DEEP", "AWAKE", "INBED"
        const sleepValue = (sample as any).value;
        if (typeof sleepValue === 'string') {
          return sleepValue.charAt(0).toUpperCase() + sleepValue.slice(1).toLowerCase();
        }
        return 'Sleep';
      }
      if (type === 'Workout') {
        return String((sample as any).activityName || 'Workout');
      }
      if (sample.value !== undefined && sample.value !== null) {
        const numVal = Number(sample.value);
        if (!isNaN(numVal)) {
          return numVal.toFixed(1);
        }
      }
      return 'N/A';
    } catch {
      return 'N/A';
    }
  };

  const formatDate = (dateStr: string): string => {
    try {
      if (!dateStr) return 'Unknown';
      return format(new Date(dateStr), 'MMM d, h:mm a');
    } catch {
      return String(dateStr);
    }
  };

  const getSourceSummary = (data: any[]): Map<string, number> => {
    const sources = new Map<string, number>();
    try {
      if (Array.isArray(data)) {
        data.forEach(sample => {
          // Ensure source is a string
          let source = sample?.sourceName;
          if (typeof source !== 'string') {
            source = 'Unknown';
          }
          sources.set(source, (sources.get(source) || 0) + 1);
        });
      }
    } catch {
      // ignore
    }
    return sources;
  };

  const getTotalValue = (data: any[], type: string): number | null => {
    try {
      // These types don't have numeric totals that make sense
      if (['SleepAnalysis', 'Workout'].includes(type)) {
        return null;
      }
      if (!Array.isArray(data) || data.length === 0) return null;

      let total = 0;
      let hasValidValue = false;
      data.forEach(sample => {
        const val = Number(sample?.value);
        if (!isNaN(val)) {
          total += val;
          hasValidValue = true;
        }
      });
      return hasValidValue ? total : null;
    } catch {
      return null;
    }
  };

  const isAnyLoading = sections.some(s => s.loading);

  return (
    <SafeAreaView style={commonStyles.safeArea} edges={['top']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          hasStartedLoading ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.text}
            />
          ) : undefined
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
              (healthKitStatus === 'checking' || healthKitStatus === 'idle') && styles.statusDotGray,
            ]} />
            <Text style={styles.statusText}>
              {healthKitStatus === 'idle' ? 'Not Started' :
               healthKitStatus === 'checking' ? 'Checking...' :
               healthKitStatus === 'available' ? 'Connected' :
               healthKitStatus === 'unavailable' ? 'Unavailable' : 'Error'}
            </Text>
          </View>
          <Text style={styles.statusMessage}>{statusMessage}</Text>
          <Text style={styles.platformInfo}>Platform: {Platform.OS}</Text>
        </Card>

        {/* Load Data Button - only show if not started or has error */}
        {(!hasStartedLoading || healthKitStatus === 'error') && !isAnyLoading && (
          <Button
            title="Load HealthKit Data"
            onPress={handleLoadData}
            fullWidth
            style={{ marginBottom: spacing.md }}
          />
        )}

        {/* Days Selector - only show after loading has started */}
        {hasStartedLoading && (
          <Card>
            <Text style={styles.cardTitle}>Date Range</Text>
            <View style={styles.daysRow}>
              {[1, 3, 7, 14, 30].map(days => (
                <TouchableOpacity
                  key={days}
                  style={[styles.dayButton, daysBack === days && styles.dayButtonActive]}
                  onPress={() => {
                    setDaysBack(days);
                    isLoadingRef.current = false;
                    loadAllData();
                  }}
                  disabled={isAnyLoading}
                >
                  <Text style={[styles.dayButtonText, daysBack === days && styles.dayButtonTextActive]}>
                    {days}d
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </Card>
        )}

        {/* Data Sections - only show after loading has started */}
        {hasStartedLoading && sections.map(section => {
          const isExpanded = expandedSection === section.type;
          const dataType = DATA_TYPES.find(dt => dt.type === section.type);
          const sourceSummary = getSourceSummary(section.data);
          const totalValue = getTotalValue(section.data, section.type);

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
                  {!section.loading && !section.error && totalValue !== null && (
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

                  {section.data.length === 0 ? (
                    <Text style={styles.noDataText}>No data found for this period</Text>
                  ) : (
                    section.data.slice(0, 20).map((sample, index) => {
                      // Ensure sourceName is a string
                      const sourceName = typeof sample?.sourceName === 'string'
                        ? sample.sourceName
                        : 'Unknown';

                      return (
                        <View key={sample?.id || index} style={styles.sampleRow}>
                          <View style={styles.sampleInfo}>
                            <Text style={styles.sampleValue}>
                              {formatSampleValue(sample, section.type)} {dataType?.unit}
                            </Text>
                            <Text style={styles.sampleDate}>
                              {formatDate(sample?.startDate || sample?.start)}
                            </Text>
                          </View>
                          <Text style={styles.sampleSource} numberOfLines={1}>
                            {sourceName}
                          </Text>
                        </View>
                      );
                    })
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
              Methods: {(() => {
                try {
                  return Object.keys(AppleHealthKit).filter(k => typeof AppleHealthKit[k] === 'function').length;
                } catch {
                  return 'Error counting';
                }
              })()}
            </Text>
          )}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

// Wrap in error boundary
export function HealthKitDataScreen() {
  const [resetKey, setResetKey] = useState(0);

  return (
    <HealthKitErrorBoundary
      key={resetKey}
      onReset={() => setResetKey(k => k + 1)}
    >
      <HealthKitDataScreenContent />
    </HealthKitErrorBoundary>
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
