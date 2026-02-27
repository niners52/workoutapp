import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Modal,
  TextInput,
  Alert,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { format, startOfWeek, endOfWeek, subWeeks, subDays } from 'date-fns';
import Svg, { Circle } from 'react-native-svg';
import { colors, typography, spacing, borderRadius, commonStyles } from '../theme';
import { Card } from '../components/common';
import { useWorkoutBarPadding } from '../components/workout';
import { MuscleGroupVolumeChart } from '../components/charts';
import { useData } from '../contexts/DataContext';
import {
  getWeeklyVolume,
  getVolumeHistory,
  calculateTrainingScore,
  aggregateIntoCategories,
  CategoryVolume,
} from '../services/analytics';
import {
  getWeeklySleepAverage,
  getWeeklyNutritionAverage,
  getAllBodyMeasurements,
  getWeightHistory,
  getBodyFatHistory,
  BodyMeasurementData,
  getAllHealthMetrics,
  getHRVHistory,
  HealthMetricsData,
  HealthMetricSample,
  getTodayCalories,
} from '../services/healthKit';
import { getTodayManualCalories, setManualCalories } from '../services/storage';
import { calculateCalorieRingStatus, CalorieRingStatus } from '../services/calorieGoal';
import { CalorieRing } from '../components/CalorieRing';
import {
  calculateRecoveryScore,
  getStoredBaselines,
  calculateBaselines,
  shouldRecalculateBaselines,
  getTrainingLoad,
  getAverageTrainingLoad,
  RecoveryResult,
  Baselines,
  clearRecoveryCache,
} from '../services/recoveryScore';
import {
  formatWeight,
  formatHeight,
  inputToLbs,
  inputToInches,
  feetAndInchesToInches,
  inchesToFeetAndInches,
} from '../services/units';
import { BodyMeasurementsSection, CaliperTestModal } from '../components/body';
import { StrengthMapCard } from '../components/strength';
import { BodyMeasurementTypeKey } from '../types';
import {
  WeeklyVolume,
  BodyMeasurement,
  BodyMeasurementHistory,
  MUSCLE_GROUP_DISPLAY_NAMES,
} from '../types';
import { RootStackParamList } from '../navigation/types';

// Recovery status colors
const RECOVERY_COLORS = {
  recovered: '#4CAF50',  // Green
  moderate: '#FFC107',   // Yellow
  strained: '#F44336',   // Red
};

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function AnalyticsScreen({ embedded }: { embedded?: boolean }) {
  const navigation = useNavigation<NavigationProp>();
  const { userSettings, bodyMeasurements, addBodyMeasurement, getLatestBodyMeasurement, workouts, sets } = useData();
  const workoutBarPadding = useWorkoutBarPadding();

  const [refreshing, setRefreshing] = useState(false);
  const [currentWeekVolume, setCurrentWeekVolume] = useState<WeeklyVolume | null>(null);
  const [volumeHistory, setVolumeHistory] = useState<WeeklyVolume[]>([]);
  const [selectedWeekIndex, setSelectedWeekIndex] = useState(0);
  const [sleepData, setSleepData] = useState<{ avgHours: number; days: number } | null>(null);
  const [nutritionData, setNutritionData] = useState<{
    avgCalories: number;
    avgProtein: number;
    avgCarbs: number;
    avgFat: number;
    days: number;
  } | null>(null);

  // Body measurements state
  const [healthKitBodyData, setHealthKitBodyData] = useState<BodyMeasurementData | null>(null);
  const [syncingHealthKit, setSyncingHealthKit] = useState(false);
  const [logModalVisible, setLogModalVisible] = useState(false);
  const [manualWeight, setManualWeight] = useState('');
  const [manualBodyFat, setManualBodyFat] = useState('');
  const [manualHeightFeet, setManualHeightFeet] = useState('');
  const [manualHeightInches, setManualHeightInches] = useState('');
  const [caliperModalVisible, setCaliperModalVisible] = useState(false);

  // Recovery state
  const [recoveryResult, setRecoveryResult] = useState<RecoveryResult | null>(null);
  const [healthMetrics, setHealthMetrics] = useState<HealthMetricsData | null>(null);
  const [hrvHistory, setHrvHistory] = useState<HealthMetricSample[]>([]);
  const [baselines, setBaselines] = useState<Baselines | null>(null);
  const [loadingRecovery, setLoadingRecovery] = useState(false);
  const [showFactorBreakdown, setShowFactorBreakdown] = useState(false);

  // Calorie tracking state
  const [todayCalories, setTodayCalories] = useState<number | null>(null);
  const [calorieRingStatus, setCalorieRingStatus] = useState<CalorieRingStatus | null>(null);
  const [calorieModalVisible, setCalorieModalVisible] = useState(false);
  const [manualCalorieInput, setManualCalorieInput] = useState('');

  const loadRecoveryData = useCallback(async () => {
    if (Platform.OS !== 'ios') {
      return;
    }

    setLoadingRecovery(true);
    try {
      // Get health metrics from HealthKit
      const metrics = await getAllHealthMetrics();
      setHealthMetrics(metrics);

      // Get HRV history for sparkline
      const hrvHist = await getHRVHistory(7);
      setHrvHistory(hrvHist);

      // Check if we need to recalculate baselines
      let currentBaselines = await getStoredBaselines();
      if (await shouldRecalculateBaselines()) {
        const newBaselines = await calculateBaselines();
        currentBaselines = {
          ...newBaselines,
          lastCalculated: new Date().toISOString(),
        };
      }
      setBaselines(currentBaselines);

      // Calculate training load
      const yesterday = subDays(new Date(), 1);
      const trainingLoadYesterday = getTrainingLoad(workouts, sets, yesterday);
      const trainingLoadAverage = getAverageTrainingLoad(workouts, sets, 7);

      // Calculate recovery score
      const result = calculateRecoveryScore({
        hrv: metrics.hrv?.value ?? null,
        hrvBaseline: currentBaselines.hrvBaseline,
        restingHR: metrics.restingHeartRate?.value ?? null,
        rhrBaseline: currentBaselines.rhrBaseline,
        sleepHours: metrics.sleepLastNight?.totalHours ?? null,
        sleepTarget: userSettings.sleepGoal || 8,
        trainingLoadYesterday,
        trainingLoadAverage,
      });

      setRecoveryResult(result);
    } catch (error) {
      console.error('Failed to load recovery data:', error);
    } finally {
      setLoadingRecovery(false);
    }
  }, [workouts, sets, userSettings.sleepGoal]);

  const loadData = useCallback(async () => {
    try {
      const today = new Date();
      const current = await getWeeklyVolume(today);
      setCurrentWeekVolume(current);

      const history = await getVolumeHistory(52); // Load a full year of history
      setVolumeHistory(history);

      // Load health data
      const sleep = await getWeeklySleepAverage(today);
      setSleepData({ avgHours: sleep.avgHours, days: sleep.days });

      const nutrition = await getWeeklyNutritionAverage(today);
      setNutritionData(nutrition);

      // Load body measurements from HealthKit
      if (Platform.OS === 'ios') {
        const bodyData = await getAllBodyMeasurements();
        setHealthKitBodyData(bodyData);
      }

      // Load recovery data
      await loadRecoveryData();

      // Load today's calories for calorie ring
      let calories: number | null = null;
      if (Platform.OS === 'ios') {
        calories = await getTodayCalories();
      }
      // Fall back to manual entry if HealthKit returns nothing
      if (calories === null || calories === 0) {
        const manualCals = await getTodayManualCalories();
        if (manualCals !== null) {
          calories = manualCals;
        }
      }
      setTodayCalories(calories);

      // Calculate calorie ring status if user has set a goal
      if (userSettings.calorieGoal && calories !== null) {
        const ringStatus = calculateCalorieRingStatus(
          calories,
          userSettings.calorieGoal,
          userSettings.nutritionMode,
          userSettings.calorieTolerancePercent
        );
        setCalorieRingStatus(ringStatus);
      } else {
        setCalorieRingStatus(null);
      }
    } catch (error) {
      console.error('Failed to load analytics:', error);
    }
  }, [loadRecoveryData]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await clearRecoveryCache(); // Force refresh recovery data
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  // Get recovery status color
  const getRecoveryColor = (status: RecoveryResult['status']): string => {
    return RECOVERY_COLORS[status];
  };

  // Recovery gauge component
  const RecoveryGauge = ({ score, status }: { score: number; status: RecoveryResult['status'] }) => {
    const size = 140;
    const strokeWidth = 12;
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;
    const progress = (score / 100) * circumference;
    const color = getRecoveryColor(status);

    return (
      <View style={styles.gaugeContainer}>
        <Svg width={size} height={size}>
          {/* Background circle */}
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={colors.backgroundTertiary}
            strokeWidth={strokeWidth}
            fill="none"
          />
          {/* Progress circle */}
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={`${progress} ${circumference}`}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </Svg>
        <View style={styles.gaugeCenter}>
          <Text style={[styles.gaugeScore, { color }]}>{score}</Text>
          <Text style={styles.gaugeLabel}>/ 100</Text>
        </View>
      </View>
    );
  };

  // Sync body measurements from HealthKit
  const syncFromHealthKit = useCallback(async () => {
    if (Platform.OS !== 'ios') return;

    setSyncingHealthKit(true);
    try {
      const bodyData = await getAllBodyMeasurements();
      setHealthKitBodyData(bodyData);

      if (bodyData.weight || bodyData.bodyFatPercentage || bodyData.heightInches) {
        const today = format(new Date(), 'yyyy-MM-dd');
        const measurement: BodyMeasurement = {
          id: `body-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          date: today,
          weight: bodyData.weight ?? undefined,
          bodyFatPercentage: bodyData.bodyFatPercentage ?? undefined,
          heightInches: bodyData.heightInches ?? undefined,
          source: 'healthkit',
          syncedAt: new Date().toISOString(),
        };
        await addBodyMeasurement(measurement);
        Alert.alert('Synced', 'Body measurements synced from Apple Health');
      } else {
        Alert.alert('No Data', 'No body measurement data found in Apple Health');
      }
    } catch (error) {
      console.error('Failed to sync from HealthKit:', error);
      Alert.alert('Error', 'Failed to sync from Apple Health');
    } finally {
      setSyncingHealthKit(false);
    }
  }, [addBodyMeasurement]);

  // Save manual body measurement
  const saveManualMeasurement = useCallback(async () => {
    const weight = manualWeight ? parseFloat(manualWeight) : undefined;
    const bodyFat = manualBodyFat ? parseFloat(manualBodyFat) : undefined;

    let totalInches: number | undefined;
    if (userSettings.units === 'imperial') {
      const heightFt = manualHeightFeet ? parseInt(manualHeightFeet, 10) : 0;
      const heightIn = manualHeightInches ? parseInt(manualHeightInches, 10) : 0;
      totalInches = heightFt > 0 || heightIn > 0 ? feetAndInchesToInches(heightFt, heightIn) : undefined;
    } else {
      // Metric: user enters cm, convert to inches for storage
      const cm = manualHeightInches ? parseFloat(manualHeightInches) : 0;
      totalInches = cm > 0 ? inputToInches(cm, 'metric') : undefined;
    }

    if (!weight && !bodyFat && !totalInches) {
      Alert.alert('No Data', 'Please enter at least one measurement');
      return;
    }

    const today = format(new Date(), 'yyyy-MM-dd');
    const measurement: BodyMeasurement = {
      id: `body-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      date: today,
      weight: weight ? inputToLbs(weight, userSettings.units) : undefined,
      bodyFatPercentage: bodyFat,
      heightInches: totalInches,
      source: 'manual',
    };

    await addBodyMeasurement(measurement);
    setLogModalVisible(false);
    setManualWeight('');
    setManualBodyFat('');
    setManualHeightFeet('');
    setManualHeightInches('');
  }, [manualWeight, manualBodyFat, manualHeightFeet, manualHeightInches, userSettings.units, addBodyMeasurement]);

  // Save caliper test results
  const saveCaliperResults = useCallback(async (
    bodyFatPercentage: number,
    skinfoldMeasurements: Record<string, number>
  ) => {
    const today = format(new Date(), 'yyyy-MM-dd');

    // Save body fat percentage
    const bodyFatMeasurement: BodyMeasurement = {
      id: `body-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      date: today,
      bodyFatPercentage,
      source: 'manual',
    };
    await addBodyMeasurement(bodyFatMeasurement);

    // Save each skinfold measurement
    for (const [type, value] of Object.entries(skinfoldMeasurements)) {
      const skinfoldMeasurement: BodyMeasurement = {
        id: `body-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        date: today,
        type: type as BodyMeasurementTypeKey,
        value, // Skinfold values are stored in mm directly
        source: 'manual',
      };
      await addBodyMeasurement(skinfoldMeasurement);
    }

    setCaliperModalVisible(false);
    Alert.alert('Saved', `Body fat: ${bodyFatPercentage}% (from caliper test)`);
  }, [addBodyMeasurement]);

  // Get the latest body measurement for display
  const latestMeasurement = getLatestBodyMeasurement();

  const displayVolume = selectedWeekIndex === 0 && currentWeekVolume
    ? currentWeekVolume
    : volumeHistory[volumeHistory.length - 1 - selectedWeekIndex];

  const trainingScore = displayVolume
    ? calculateTrainingScore(displayVolume.muscleGroups)
    : 0;

  const handleMuscleGroupPress = (muscleGroup: string) => {
    if (displayVolume) {
      navigation.navigate('MuscleGroupDetail', {
        muscleGroup,
        weekStart: displayVolume.weekStart,
      });
    }
  };

  const handleMeasurementHistoryPress = (type: BodyMeasurementTypeKey) => {
    navigation.navigate('MeasurementHistory', { measurementType: type });
  };

  const dayOffset = userSettings.weekStartDay === 'sunday' ? 0 : 1;
  const weekStart = startOfWeek(new Date(), { weekStartsOn: dayOffset as 0 | 1 });
  const weekEnd = endOfWeek(new Date(), { weekStartsOn: dayOffset as 0 | 1 });

  // Get 6 category aggregates
  const categoryVolumes = displayVolume
    ? aggregateIntoCategories(displayVolume.muscleGroups)
    : [];

  const content = (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingBottom: spacing.xxl + workoutBarPadding }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.text}
          />
        }
      >
        {/* Header */}
        <Text style={styles.title}>Analytics</Text>

        {/* Recovery Section */}
        {Platform.OS === 'ios' && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recovery</Text>
              {loadingRecovery && (
                <ActivityIndicator size="small" color={colors.primary} />
              )}
            </View>

            {recoveryResult ? (
              <>
                {/* Recovery Score Card */}
                <Card style={styles.recoveryCard}>
                  <RecoveryGauge score={recoveryResult.score} status={recoveryResult.status} />
                  <Text style={[styles.recoveryStatus, { color: getRecoveryColor(recoveryResult.status) }]}>
                    {recoveryResult.status === 'recovered' ? 'Recovered' :
                     recoveryResult.status === 'moderate' ? 'Moderate' : 'Strained'}
                  </Text>
                  <Text style={styles.recoveryRecommendation}>
                    {recoveryResult.recommendation}
                  </Text>
                </Card>

                {/* Health Metrics Grid */}
                <View style={styles.metricsGrid}>
                  {/* HRV */}
                  <Card style={styles.metricCard}>
                    <Text style={styles.metricLabel}>HRV</Text>
                    <Text style={styles.metricValue}>
                      {healthMetrics?.hrv?.value ? `${healthMetrics.hrv.value}` : '--'}
                    </Text>
                    <Text style={styles.metricUnit}>ms</Text>
                    {baselines?.hrvBaseline && healthMetrics?.hrv && (
                      <Text style={[
                        styles.metricTrend,
                        healthMetrics.hrv.value >= baselines.hrvBaseline
                          ? styles.metricTrendPositive
                          : styles.metricTrendNegative
                      ]}>
                        {healthMetrics.hrv.value >= baselines.hrvBaseline ? '↑' : '↓'} vs baseline
                      </Text>
                    )}
                  </Card>

                  {/* Resting HR */}
                  <Card style={styles.metricCard}>
                    <Text style={styles.metricLabel}>Resting HR</Text>
                    <Text style={styles.metricValue}>
                      {healthMetrics?.restingHeartRate?.value ? `${healthMetrics.restingHeartRate.value}` : '--'}
                    </Text>
                    <Text style={styles.metricUnit}>bpm</Text>
                    {baselines?.rhrBaseline && healthMetrics?.restingHeartRate && (
                      <Text style={[
                        styles.metricTrend,
                        healthMetrics.restingHeartRate.value <= baselines.rhrBaseline
                          ? styles.metricTrendPositive
                          : styles.metricTrendNegative
                      ]}>
                        {healthMetrics.restingHeartRate.value <= baselines.rhrBaseline ? '↓' : '↑'} vs baseline
                      </Text>
                    )}
                  </Card>

                  {/* Sleep */}
                  <Card style={styles.metricCard}>
                    <Text style={styles.metricLabel}>Sleep</Text>
                    <Text style={styles.metricValue}>
                      {healthMetrics?.sleepLastNight?.totalHours
                        ? healthMetrics.sleepLastNight.totalHours.toFixed(1)
                        : '--'}
                    </Text>
                    <Text style={styles.metricUnit}>hrs</Text>
                    {healthMetrics?.sleepLastNight && (
                      <Text style={[
                        styles.metricTrend,
                        healthMetrics.sleepLastNight.totalHours >= 7
                          ? styles.metricTrendPositive
                          : styles.metricTrendNegative
                      ]}>
                        {healthMetrics.sleepLastNight.totalHours >= 7 ? 'Good' : 'Low'}
                      </Text>
                    )}
                  </Card>

                  {/* SpO2 */}
                  <Card style={styles.metricCard}>
                    <Text style={styles.metricLabel}>SpO2</Text>
                    <Text style={styles.metricValue}>
                      {healthMetrics?.spO2?.value ? `${healthMetrics.spO2.value}` : '--'}
                    </Text>
                    <Text style={styles.metricUnit}>%</Text>
                    {healthMetrics?.spO2 && (
                      <Text style={[
                        styles.metricTrend,
                        healthMetrics.spO2.value >= 95
                          ? styles.metricTrendPositive
                          : styles.metricTrendNegative
                      ]}>
                        {healthMetrics.spO2.value >= 95 ? 'Normal' : 'Low'}
                      </Text>
                    )}
                  </Card>
                </View>

                {/* Factor Breakdown (Expandable) */}
                <TouchableOpacity
                  style={styles.factorToggle}
                  onPress={() => setShowFactorBreakdown(!showFactorBreakdown)}
                >
                  <Text style={styles.factorToggleText}>
                    {showFactorBreakdown ? 'Hide' : 'Show'} Factor Breakdown
                  </Text>
                  <Text style={styles.factorToggleIcon}>
                    {showFactorBreakdown ? '▲' : '▼'}
                  </Text>
                </TouchableOpacity>

                {showFactorBreakdown && (
                  <Card style={styles.factorBreakdownCard}>
                    {recoveryResult.factors.hrv && (
                      <View style={styles.factorRow}>
                        <View style={styles.factorInfo}>
                          <Text style={styles.factorName}>HRV</Text>
                          <Text style={styles.factorDetail}>{recoveryResult.factors.hrv.detail}</Text>
                        </View>
                        <Text style={[
                          styles.factorScore,
                          recoveryResult.factors.hrv.score >= 70 ? styles.factorScoreGood :
                          recoveryResult.factors.hrv.score >= 40 ? styles.factorScoreModerate :
                          styles.factorScoreLow
                        ]}>
                          {recoveryResult.factors.hrv.score}/100
                        </Text>
                      </View>
                    )}
                    {recoveryResult.factors.rhr && (
                      <View style={styles.factorRow}>
                        <View style={styles.factorInfo}>
                          <Text style={styles.factorName}>Resting Heart Rate</Text>
                          <Text style={styles.factorDetail}>{recoveryResult.factors.rhr.detail}</Text>
                        </View>
                        <Text style={[
                          styles.factorScore,
                          recoveryResult.factors.rhr.score >= 70 ? styles.factorScoreGood :
                          recoveryResult.factors.rhr.score >= 40 ? styles.factorScoreModerate :
                          styles.factorScoreLow
                        ]}>
                          {recoveryResult.factors.rhr.score}/100
                        </Text>
                      </View>
                    )}
                    {recoveryResult.factors.sleep && (
                      <View style={styles.factorRow}>
                        <View style={styles.factorInfo}>
                          <Text style={styles.factorName}>Sleep</Text>
                          <Text style={styles.factorDetail}>{recoveryResult.factors.sleep.detail}</Text>
                        </View>
                        <Text style={[
                          styles.factorScore,
                          recoveryResult.factors.sleep.score >= 70 ? styles.factorScoreGood :
                          recoveryResult.factors.sleep.score >= 40 ? styles.factorScoreModerate :
                          styles.factorScoreLow
                        ]}>
                          {recoveryResult.factors.sleep.score}/100
                        </Text>
                      </View>
                    )}
                    {recoveryResult.factors.training && (
                      <View style={[styles.factorRow, styles.factorRowLast]}>
                        <View style={styles.factorInfo}>
                          <Text style={styles.factorName}>Training Load</Text>
                          <Text style={styles.factorDetail}>{recoveryResult.factors.training.detail}</Text>
                        </View>
                        <Text style={[
                          styles.factorScore,
                          recoveryResult.factors.training.score >= 70 ? styles.factorScoreGood :
                          recoveryResult.factors.training.score >= 40 ? styles.factorScoreModerate :
                          styles.factorScoreLow
                        ]}>
                          {recoveryResult.factors.training.score}/100
                        </Text>
                      </View>
                    )}
                  </Card>
                )}
              </>
            ) : !loadingRecovery ? (
              <Card style={styles.emptyRecoveryCard}>
                <Text style={styles.emptyRecoveryTitle}>Connect Apple Health</Text>
                <Text style={styles.emptyRecoveryText}>
                  Enable Apple Health integration to see your recovery score based on HRV, heart rate, and sleep data.
                </Text>
                {!healthMetrics?.hrv && (
                  <Text style={styles.emptyRecoveryHint}>
                    Tip: Wear Apple Watch while sleeping for HRV-based recovery insights
                  </Text>
                )}
              </Card>
            ) : null}
          </View>
        )}

        {/* Calorie Ring Section */}
        {userSettings.calorieGoal && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Today's Calories</Text>
              {(todayCalories === null || todayCalories === 0) && (
                <TouchableOpacity
                  style={styles.logCaloriesButton}
                  onPress={() => {
                    setManualCalorieInput('');
                    setCalorieModalVisible(true);
                  }}
                >
                  <Text style={styles.logCaloriesButtonText}>Log Calories</Text>
                </TouchableOpacity>
              )}
            </View>

            {calorieRingStatus ? (
              <CalorieRing status={calorieRingStatus} />
            ) : (
              <Card style={styles.emptyCalorieCard}>
                <Text style={styles.emptyCalorieTitle}>No Calorie Data</Text>
                <Text style={styles.emptyCalorieText}>
                  {Platform.OS === 'ios'
                    ? 'Log your meals in Apple Health or tap "Log Calories" to manually enter today\'s intake.'
                    : 'Tap "Log Calories" to manually enter today\'s calorie intake.'}
                </Text>
                <TouchableOpacity
                  style={styles.emptyLogButton}
                  onPress={() => {
                    setManualCalorieInput('');
                    setCalorieModalVisible(true);
                  }}
                >
                  <Text style={styles.emptyLogButtonText}>Log Calories</Text>
                </TouchableOpacity>
              </Card>
            )}
          </View>
        )}

        {/* Week Selector */}
        <View style={styles.weekSelector}>
          <TouchableOpacity
            style={styles.weekButton}
            onPress={() => setSelectedWeekIndex(Math.min(selectedWeekIndex + 1, volumeHistory.length - 1))}
            disabled={selectedWeekIndex >= volumeHistory.length - 1}
          >
            <Text style={[styles.weekButtonText, selectedWeekIndex >= volumeHistory.length - 1 && styles.weekButtonDisabled]}>
              ‹ Previous
            </Text>
          </TouchableOpacity>

          <View style={styles.weekInfo}>
            <Text style={styles.weekLabel}>
              {selectedWeekIndex === 0 ? 'This Week' : `${selectedWeekIndex} week${selectedWeekIndex > 1 ? 's' : ''} ago`}
            </Text>
            {displayVolume && (
              <Text style={styles.weekDates}>
                {format(new Date(displayVolume.weekStart), 'MMM d, yyyy')} -{' '}
                {format(new Date(displayVolume.weekEnd), 'MMM d, yyyy')}
              </Text>
            )}
          </View>

          <TouchableOpacity
            style={styles.weekButton}
            onPress={() => setSelectedWeekIndex(Math.max(selectedWeekIndex - 1, 0))}
            disabled={selectedWeekIndex <= 0}
          >
            <Text style={[styles.weekButtonText, selectedWeekIndex <= 0 && styles.weekButtonDisabled]}>
              Next ›
            </Text>
          </TouchableOpacity>
        </View>

        {/* Training Score */}
        <Card style={styles.scoreCard}>
          <Text style={styles.scoreLabel}>Training Score</Text>
          <Text style={[styles.scoreValue, trainingScore >= 100 && styles.scoreComplete]}>
            {trainingScore}%
          </Text>
          {displayVolume && (
            <Text style={styles.scoreSubtext}>
              {displayVolume.totalSets} / {displayVolume.targetSets} total sets
            </Text>
          )}
        </Card>

        {/* Health Data - Sleep & Nutrition */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Health (Last 7 Days)</Text>
          <View style={styles.healthGrid}>
            {/* Sleep */}
            <Card style={styles.healthCard}>
              <Text style={styles.healthLabel}>Avg Sleep</Text>
              <Text style={styles.healthValue}>
                {sleepData && sleepData.avgHours > 0 ? `${sleepData.avgHours}h` : '--'}
              </Text>
              {sleepData && sleepData.days > 0 && (
                <Text style={styles.healthSubtext}>
                  {Math.round((sleepData.avgHours / userSettings.sleepGoal) * 100)}% of {userSettings.sleepGoal}h goal
                </Text>
              )}
              {(!sleepData || sleepData.days === 0) && (
                <Text style={styles.healthSubtext}>No data</Text>
              )}
            </Card>

            {/* Protein */}
            <Card style={styles.healthCard}>
              <Text style={styles.healthLabel}>Avg Protein</Text>
              <Text style={styles.healthValue}>
                {nutritionData && nutritionData.avgProtein > 0 ? `${nutritionData.avgProtein}g` : '--'}
              </Text>
              {nutritionData && nutritionData.days > 0 && nutritionData.avgProtein > 0 && (
                <Text style={styles.healthSubtext}>
                  {Math.round((nutritionData.avgProtein / userSettings.proteinGoal) * 100)}% of {userSettings.proteinGoal}g goal
                </Text>
              )}
              {(!nutritionData || nutritionData.days === 0 || nutritionData.avgProtein === 0) && (
                <Text style={styles.healthSubtext}>No data</Text>
              )}
            </Card>
          </View>

          {/* Additional nutrition if available */}
          {nutritionData && nutritionData.days > 0 && (nutritionData.avgCalories > 0 || nutritionData.avgCarbs > 0) && (
            <View style={styles.nutritionRow}>
              {nutritionData.avgCalories > 0 && (
                <View style={styles.nutritionItem}>
                  <Text style={styles.nutritionLabel}>Calories</Text>
                  <Text style={styles.nutritionValue}>{nutritionData.avgCalories}</Text>
                </View>
              )}
              {nutritionData.avgCarbs > 0 && (
                <View style={styles.nutritionItem}>
                  <Text style={styles.nutritionLabel}>Carbs</Text>
                  <Text style={styles.nutritionValue}>{nutritionData.avgCarbs}g</Text>
                </View>
              )}
              {nutritionData.avgFat > 0 && (
                <View style={styles.nutritionItem}>
                  <Text style={styles.nutritionLabel}>Fat</Text>
                  <Text style={styles.nutritionValue}>{nutritionData.avgFat}g</Text>
                </View>
              )}
            </View>
          )}
        </View>

        {/* Body Measurements */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Body Measurements</Text>
            <View style={styles.bodyMeasurementButtons}>
              {Platform.OS === 'ios' && (
                <TouchableOpacity
                  style={styles.syncButton}
                  onPress={syncFromHealthKit}
                  disabled={syncingHealthKit}
                >
                  {syncingHealthKit ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Text style={styles.syncButtonText}>Sync</Text>
                  )}
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.caliperButton}
                onPress={() => setCaliperModalVisible(true)}
              >
                <Text style={styles.caliperButtonText}>Caliper</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.logButton}
                onPress={() => setLogModalVisible(true)}
              >
                <Text style={styles.logButtonText}>+ Log</Text>
              </TouchableOpacity>
            </View>
          </View>

          {latestMeasurement || healthKitBodyData ? (
            <View style={styles.bodyMeasurementGrid}>
              {/* Weight */}
              <Card style={styles.bodyMeasurementCard}>
                <Text style={styles.bodyMeasurementLabel}>Weight</Text>
                <Text style={styles.bodyMeasurementValue}>
                  {latestMeasurement?.weight
                    ? formatWeight(latestMeasurement.weight, userSettings.units)
                    : healthKitBodyData?.weight
                      ? formatWeight(healthKitBodyData.weight, userSettings.units)
                      : '--'}
                </Text>
                {latestMeasurement?.date && latestMeasurement?.weight && (
                  <Text style={styles.bodyMeasurementDate}>
                    {format(new Date(latestMeasurement.date), 'MMM d')}
                  </Text>
                )}
              </Card>

              {/* Body Fat */}
              <Card style={styles.bodyMeasurementCard}>
                <Text style={styles.bodyMeasurementLabel}>Body Fat</Text>
                <Text style={styles.bodyMeasurementValue}>
                  {latestMeasurement?.bodyFatPercentage
                    ? `${latestMeasurement.bodyFatPercentage.toFixed(1)}%`
                    : healthKitBodyData?.bodyFatPercentage
                      ? `${healthKitBodyData.bodyFatPercentage.toFixed(1)}%`
                      : '--'}
                </Text>
                {latestMeasurement?.date && latestMeasurement?.bodyFatPercentage && (
                  <Text style={styles.bodyMeasurementDate}>
                    {format(new Date(latestMeasurement.date), 'MMM d')}
                  </Text>
                )}
              </Card>

              {/* Height */}
              <Card style={styles.bodyMeasurementCard}>
                <Text style={styles.bodyMeasurementLabel}>Height</Text>
                <Text style={styles.bodyMeasurementValue}>
                  {latestMeasurement?.heightInches
                    ? formatHeight(latestMeasurement.heightInches, userSettings.units)
                    : healthKitBodyData?.heightInches
                      ? formatHeight(healthKitBodyData.heightInches, userSettings.units)
                      : '--'}
                </Text>
                {latestMeasurement?.date && latestMeasurement?.heightInches && (
                  <Text style={styles.bodyMeasurementDate}>
                    {format(new Date(latestMeasurement.date), 'MMM d')}
                  </Text>
                )}
              </Card>
            </View>
          ) : (
            <Card style={styles.emptyBodyCard}>
              <Text style={styles.emptyBodyText}>No body measurements logged</Text>
              <Text style={styles.emptyBodySubtext}>
                {Platform.OS === 'ios'
                  ? 'Sync from Apple Health or log manually'
                  : 'Tap "+ Log" to add your measurements'}
              </Text>
            </Card>
          )}
        </View>

        {/* Bodybuilding Body Measurements */}
        <BodyMeasurementsSection onNavigateToHistory={handleMeasurementHistoryPress} />

        {/* Strength Map */}
        <StrengthMapCard />

        {/* Category Summary */}
        {categoryVolumes.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Category Summary</Text>
            <View style={styles.categoryGrid}>
              {categoryVolumes.map(cv => (
                <TouchableOpacity
                  key={cv.category}
                  style={styles.categoryCard}
                  onPress={() => {/* Could expand to show muscle groups */}}
                >
                  <Text style={styles.categoryName}>{cv.name}</Text>
                  <Text style={styles.categorySets}>
                    {cv.totalSets} / {cv.totalTarget}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Volume by Muscle Group */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Volume by Muscle Group</Text>
          {displayVolume ? (
            <MuscleGroupVolumeChart
              volumes={displayVolume.muscleGroups}
              onMuscleGroupPress={handleMuscleGroupPress}
            />
          ) : (
            <Card>
              <Text style={styles.emptyText}>No data for this week</Text>
            </Card>
          )}
        </View>

        {/* Weekly Trend - Show last 8 weeks */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Training Score (Last 8 Weeks)</Text>
          <Card>
            <View style={styles.trendChartContainer}>
              <View style={styles.trendYAxis}>
                <Text style={styles.trendYLabel}>100%</Text>
                <Text style={styles.trendYLabel}>50%</Text>
                <Text style={styles.trendYLabel}>0%</Text>
              </View>
              <View style={styles.trendChart}>
                {volumeHistory.slice(-8).map((week, index) => {
                  const actualIndex = volumeHistory.length - 8 + index;
                  const score = calculateTrainingScore(week.muscleGroups);
                  const chartHeight = 80; // Fixed height in pixels
                  const barHeight = Math.max((score / 100) * chartHeight, 4);
                  const isSelected = actualIndex === volumeHistory.length - 1 - selectedWeekIndex;
                  const weekStartDate = new Date(week.weekStart);
                  const weekEndDate = new Date(week.weekEnd);

                  return (
                    <TouchableOpacity
                      key={week.weekStart}
                      style={styles.trendBarContainer}
                      onPress={() => setSelectedWeekIndex(volumeHistory.length - 1 - actualIndex)}
                    >
                      <View style={styles.trendBarArea}>
                        <View
                          style={[
                            styles.trendBar,
                            { height: barHeight },
                            isSelected && styles.trendBarSelected,
                            score >= 100 && styles.trendBarComplete,
                          ]}
                        />
                      </View>
                      <Text style={[styles.trendLabel, isSelected && styles.trendLabelSelected]}>
                        {format(weekStartDate, 'M/d')}-{format(weekEndDate, 'M/d')}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
            <Text style={styles.trendCaption}>% of target sets completed per week</Text>
          </Card>
        </View>
      </ScrollView>

      {/* Manual Log Modal */}
      <Modal
        visible={logModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setLogModalVisible(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setLogModalVisible(false)}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Log Measurements</Text>
            <TouchableOpacity onPress={saveManualMeasurement}>
              <Text style={styles.modalSave}>Save</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            {/* Weight Input */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>
                Weight ({userSettings.units === 'metric' ? 'kg' : 'lbs'})
              </Text>
              <TextInput
                style={styles.input}
                value={manualWeight}
                onChangeText={setManualWeight}
                placeholder="Enter weight"
                placeholderTextColor={colors.textTertiary}
                keyboardType="decimal-pad"
              />
            </View>

            {/* Body Fat Input */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Body Fat %</Text>
              <TextInput
                style={styles.input}
                value={manualBodyFat}
                onChangeText={setManualBodyFat}
                placeholder="Enter body fat percentage"
                placeholderTextColor={colors.textTertiary}
                keyboardType="decimal-pad"
              />
            </View>

            {/* Height Input */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Height</Text>
              {userSettings.units === 'imperial' ? (
                <View style={styles.heightInputRow}>
                  <View style={styles.heightInputGroup}>
                    <TextInput
                      style={[styles.input, styles.heightInput]}
                      value={manualHeightFeet}
                      onChangeText={setManualHeightFeet}
                      placeholder="Feet"
                      placeholderTextColor={colors.textTertiary}
                      keyboardType="number-pad"
                    />
                    <Text style={styles.heightUnit}>ft</Text>
                  </View>
                  <View style={styles.heightInputGroup}>
                    <TextInput
                      style={[styles.input, styles.heightInput]}
                      value={manualHeightInches}
                      onChangeText={setManualHeightInches}
                      placeholder="Inches"
                      placeholderTextColor={colors.textTertiary}
                      keyboardType="number-pad"
                    />
                    <Text style={styles.heightUnit}>in</Text>
                  </View>
                </View>
              ) : (
                <TextInput
                  style={styles.input}
                  value={manualHeightInches}
                  onChangeText={(text) => {
                    // For metric, convert cm to inches when saving
                    setManualHeightInches(text);
                  }}
                  placeholder="Enter height in cm"
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="number-pad"
                />
              )}
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Caliper Test Modal */}
      <CaliperTestModal
        visible={caliperModalVisible}
        onClose={() => setCaliperModalVisible(false)}
        onSave={saveCaliperResults}
        currentBodyWeight={latestMeasurement?.weight}
      />

      {/* Manual Calorie Entry Modal */}
      <Modal
        visible={calorieModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setCalorieModalVisible(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setCalorieModalVisible(false)}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Log Calories</Text>
            <TouchableOpacity
              onPress={async () => {
                const calories = parseInt(manualCalorieInput, 10);
                if (isNaN(calories) || calories <= 0) {
                  Alert.alert('Invalid Input', 'Please enter a valid calorie amount');
                  return;
                }
                await setManualCalories(format(new Date(), 'yyyy-MM-dd'), calories);
                setTodayCalories(calories);
                if (userSettings.calorieGoal) {
                  const ringStatus = calculateCalorieRingStatus(
                    calories,
                    userSettings.calorieGoal,
                    userSettings.nutritionMode,
                    userSettings.calorieTolerancePercent
                  );
                  setCalorieRingStatus(ringStatus);
                }
                setCalorieModalVisible(false);
              }}
            >
              <Text style={styles.modalSave}>Save</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.modalContent}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Total Calories Today</Text>
              <TextInput
                style={styles.input}
                value={manualCalorieInput}
                onChangeText={setManualCalorieInput}
                placeholder="e.g. 2000"
                placeholderTextColor={colors.textTertiary}
                keyboardType="number-pad"
                autoFocus
              />
            </View>
            <Text style={styles.calorieModalHint}>
              Enter your total calorie intake for today. This will override any previous manual entry.
            </Text>
          </View>
        </SafeAreaView>
      </Modal>
    </>
  );

  if (embedded) return content;

  return (
    <SafeAreaView style={commonStyles.safeArea} edges={['top']}>
      {content}
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
  title: {
    fontSize: typography.size.xxxl,
    fontWeight: typography.weight.bold,
    color: colors.text,
    marginBottom: spacing.lg,
  },
  weekSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  weekButton: {
    padding: spacing.sm,
  },
  weekButtonText: {
    fontSize: typography.size.md,
    color: colors.primary,
  },
  weekButtonDisabled: {
    opacity: 0.3,
  },
  weekInfo: {
    alignItems: 'center',
  },
  weekLabel: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.text,
  },
  weekDates: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  scoreCard: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  scoreLabel: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  scoreValue: {
    fontSize: 48,
    fontWeight: typography.weight.bold,
    color: colors.text,
    marginVertical: spacing.sm,
  },
  scoreComplete: {
    color: colors.success,
  },
  scoreSubtext: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  categoryCard: {
    width: '31%',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    alignItems: 'center',
  },
  categoryName: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    color: colors.text,
    textAlign: 'center',
  },
  categorySets: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.bold,
    color: colors.primary,
    marginTop: spacing.xs,
  },
  healthGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  healthCard: {
    flex: 1,
    alignItems: 'center',
    padding: spacing.base,
  },
  healthLabel: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  healthValue: {
    fontSize: 32,
    fontWeight: typography.weight.bold,
    color: colors.text,
    marginVertical: spacing.xs,
  },
  healthSubtext: {
    fontSize: typography.size.xs,
    color: colors.textTertiary,
    textAlign: 'center',
  },
  nutritionRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginTop: spacing.sm,
  },
  nutritionItem: {
    alignItems: 'center',
  },
  nutritionLabel: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },
  nutritionValue: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.text,
    marginTop: 2,
  },
  emptyText: {
    fontSize: typography.size.base,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  trendChartContainer: {
    flexDirection: 'row',
  },
  trendYAxis: {
    width: 36,
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingRight: spacing.xs,
    paddingBottom: 24,
    height: 104,
  },
  trendYLabel: {
    fontSize: typography.size.xs,
    color: colors.textTertiary,
  },
  trendChart: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 104,
  },
  trendBarContainer: {
    flex: 1,
    alignItems: 'center',
  },
  trendBarArea: {
    height: 80,
    width: 24,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  trendBar: {
    width: 20,
    backgroundColor: colors.backgroundTertiary,
    borderRadius: borderRadius.sm,
    minHeight: 4,
  },
  trendBarSelected: {
    backgroundColor: colors.primary,
  },
  trendBarComplete: {
    backgroundColor: colors.success,
  },
  trendLabel: {
    fontSize: 8,
    color: colors.textTertiary,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  trendLabelSelected: {
    color: colors.primary,
    fontWeight: typography.weight.medium,
  },
  trendCaption: {
    fontSize: typography.size.xs,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  // Body Measurements styles
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  bodyMeasurementButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  syncButton: {
    backgroundColor: colors.backgroundSecondary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
    minWidth: 60,
    alignItems: 'center',
  },
  syncButtonText: {
    fontSize: typography.size.sm,
    color: colors.primary,
    fontWeight: typography.weight.medium,
  },
  caliperButton: {
    backgroundColor: colors.backgroundTertiary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
  },
  caliperButtonText: {
    fontSize: typography.size.sm,
    color: colors.text,
    fontWeight: typography.weight.medium,
  },
  logButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
  },
  logButtonText: {
    fontSize: typography.size.sm,
    color: colors.background,
    fontWeight: typography.weight.medium,
  },
  bodyMeasurementGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  bodyMeasurementCard: {
    flex: 1,
    alignItems: 'center',
    padding: spacing.base,
  },
  bodyMeasurementLabel: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  bodyMeasurementValue: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: colors.text,
    marginVertical: spacing.xs,
  },
  bodyMeasurementDate: {
    fontSize: typography.size.xs,
    color: colors.textTertiary,
  },
  emptyBodyCard: {
    alignItems: 'center',
    padding: spacing.xl,
  },
  emptyBodyText: {
    fontSize: typography.size.base,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  emptyBodySubtext: {
    fontSize: typography.size.sm,
    color: colors.textTertiary,
    textAlign: 'center',
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: colors.backgroundTertiary,
  },
  modalCancel: {
    fontSize: typography.size.base,
    color: colors.textSecondary,
  },
  modalTitle: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.text,
  },
  modalSave: {
    fontSize: typography.size.base,
    color: colors.primary,
    fontWeight: typography.weight.semibold,
  },
  modalContent: {
    flex: 1,
    padding: spacing.base,
  },
  inputGroup: {
    marginBottom: spacing.lg,
  },
  inputLabel: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: typography.size.lg,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.backgroundTertiary,
  },
  heightInputRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  heightInputGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  heightInput: {
    flex: 1,
  },
  heightUnit: {
    fontSize: typography.size.base,
    color: colors.textSecondary,
    marginLeft: spacing.sm,
    minWidth: 20,
  },
  // Recovery styles
  recoveryCard: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  gaugeContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gaugeCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gaugeScore: {
    fontSize: 40,
    fontWeight: typography.weight.bold,
  },
  gaugeLabel: {
    fontSize: typography.size.sm,
    color: colors.textTertiary,
  },
  recoveryStatus: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    marginTop: spacing.md,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  recoveryRecommendation: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    lineHeight: 20,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  metricCard: {
    width: '48%',
    alignItems: 'center',
    padding: spacing.base,
  },
  metricLabel: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metricValue: {
    fontSize: 28,
    fontWeight: typography.weight.bold,
    color: colors.text,
    marginTop: spacing.xs,
  },
  metricUnit: {
    fontSize: typography.size.sm,
    color: colors.textTertiary,
  },
  metricTrend: {
    fontSize: typography.size.xs,
    marginTop: spacing.xs,
  },
  metricTrendPositive: {
    color: '#4CAF50',
  },
  metricTrendNegative: {
    color: '#F44336',
  },
  factorToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  factorToggleText: {
    fontSize: typography.size.sm,
    color: colors.primary,
    fontWeight: typography.weight.medium,
  },
  factorToggleIcon: {
    fontSize: typography.size.xs,
    color: colors.primary,
    marginLeft: spacing.xs,
  },
  factorBreakdownCard: {
    padding: spacing.sm,
  },
  factorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.backgroundTertiary,
  },
  factorRowLast: {
    borderBottomWidth: 0,
  },
  factorInfo: {
    flex: 1,
  },
  factorName: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    color: colors.text,
  },
  factorDetail: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  factorScore: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    marginLeft: spacing.md,
  },
  factorScoreGood: {
    color: '#4CAF50',
  },
  factorScoreModerate: {
    color: '#FFC107',
  },
  factorScoreLow: {
    color: '#F44336',
  },
  emptyRecoveryCard: {
    alignItems: 'center',
    padding: spacing.xl,
  },
  emptyRecoveryTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  emptyRecoveryText: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyRecoveryHint: {
    fontSize: typography.size.xs,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.md,
    fontStyle: 'italic',
  },
  // Calorie Ring styles
  logCaloriesButton: {
    backgroundColor: colors.backgroundTertiary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
  },
  logCaloriesButtonText: {
    fontSize: typography.size.sm,
    color: colors.primary,
    fontWeight: typography.weight.medium,
  },
  emptyCalorieCard: {
    alignItems: 'center',
    padding: spacing.xl,
  },
  emptyCalorieTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  emptyCalorieText: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  emptyLogButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  emptyLogButtonText: {
    fontSize: typography.size.base,
    color: colors.background,
    fontWeight: typography.weight.semibold,
  },
  calorieModalHint: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: spacing.md,
  },
});

export default AnalyticsScreen;
