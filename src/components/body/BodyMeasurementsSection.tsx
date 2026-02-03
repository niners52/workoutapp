import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { format, subDays } from 'date-fns';
import DateTimePicker from '@react-native-community/datetimepicker';
import { colors, typography, spacing, borderRadius } from '../../theme';
import { Card } from '../common';
import { useData } from '../../contexts/DataContext';
import {
  BODY_MEASUREMENT_TYPES,
  MEASUREMENT_INSTRUCTIONS,
  getGroupedMeasurements,
  isIncreasePositive,
  BodyMeasurementType,
} from '../../constants/bodyMeasurements';
import {
  getLatestAllTypedMeasurements,
  getMeasurementValue30DaysAgo,
  addTypedBodyMeasurement,
  addMultipleTypedMeasurements,
  getTypedMeasurementHistory,
} from '../../services/storage';
import {
  formatMeasurement,
  measurementInputToInches,
  displayMeasurement,
  measurementUnit,
} from '../../services/units';
import { BodyMeasurement, BodyMeasurementTypeKey } from '../../types';
import { syncBodyMeasurement } from '../../services/syncService';

interface Props {
  onNavigateToHistory: (type: BodyMeasurementTypeKey) => void;
}

interface MeasurementData {
  latest: Record<BodyMeasurementTypeKey, BodyMeasurement | undefined>;
  trends: Record<string, 'up' | 'down' | 'same' | null>;
}

export function BodyMeasurementsSection({ onNavigateToHistory }: Props) {
  const { userSettings } = useData();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<MeasurementData>({
    latest: {} as Record<BodyMeasurementTypeKey, BodyMeasurement | undefined>,
    trends: {},
  });

  // Modal states
  const [quickLogVisible, setQuickLogVisible] = useState(false);
  const [measureAllVisible, setMeasureAllVisible] = useState(false);
  const [selectedType, setSelectedType] = useState<BodyMeasurementType | null>(null);

  // Quick log modal state
  const [quickLogValue, setQuickLogValue] = useState('');
  const [quickLogDate, setQuickLogDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);

  // Measure all modal state
  const [measureAllStep, setMeasureAllStep] = useState(0);
  const [measureAllValues, setMeasureAllValues] = useState<Record<string, string>>({});
  const [measureAllShowSummary, setMeasureAllShowSummary] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const latest = await getLatestAllTypedMeasurements();

      // Calculate trends
      const trends: Record<string, 'up' | 'down' | 'same' | null> = {};
      for (const type of BODY_MEASUREMENT_TYPES) {
        const currentValue = latest[type.key as BodyMeasurementTypeKey]?.value;
        if (currentValue !== undefined) {
          const oldValue = await getMeasurementValue30DaysAgo(type.key as BodyMeasurementTypeKey);
          if (oldValue !== undefined) {
            if (currentValue > oldValue + 0.1) {
              trends[type.key] = 'up';
            } else if (currentValue < oldValue - 0.1) {
              trends[type.key] = 'down';
            } else {
              trends[type.key] = 'same';
            }
          } else {
            trends[type.key] = null;
          }
        } else {
          trends[type.key] = null;
        }
      }

      setData({ latest, trends });
    } catch (error) {
      console.error('Failed to load body measurements:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openQuickLog = (type: BodyMeasurementType) => {
    setSelectedType(type);
    const currentValue = data.latest[type.key as BodyMeasurementTypeKey]?.value;
    if (currentValue !== undefined) {
      setQuickLogValue(displayMeasurement(currentValue, userSettings.units).toString());
    } else {
      setQuickLogValue('');
    }
    setQuickLogDate(new Date());
    setQuickLogVisible(true);
  };

  const saveQuickLog = async () => {
    if (!selectedType || !quickLogValue) return;

    const value = parseFloat(quickLogValue);
    if (isNaN(value) || value <= 0) {
      Alert.alert('Invalid Value', 'Please enter a valid measurement');
      return;
    }

    setSaving(true);
    try {
      const valueInInches = measurementInputToInches(value, userSettings.units);
      const dateStr = format(quickLogDate, 'yyyy-MM-dd');
      const measurement = await addTypedBodyMeasurement(
        selectedType.key as BodyMeasurementTypeKey,
        valueInInches,
        dateStr
      );
      await syncBodyMeasurement(measurement);
      setQuickLogVisible(false);
      setQuickLogValue('');
      await loadData();
    } catch (error) {
      console.error('Failed to save measurement:', error);
      Alert.alert('Error', 'Failed to save measurement');
    } finally {
      setSaving(false);
    }
  };

  const openMeasureAll = () => {
    setMeasureAllStep(0);
    setMeasureAllValues({});
    setMeasureAllShowSummary(false);
    setMeasureAllVisible(true);
  };

  const handleMeasureAllNext = () => {
    const currentType = BODY_MEASUREMENT_TYPES[measureAllStep];
    const value = measureAllValues[currentType.key];

    if (measureAllStep < BODY_MEASUREMENT_TYPES.length - 1) {
      setMeasureAllStep(measureAllStep + 1);
    } else {
      setMeasureAllShowSummary(true);
    }
  };

  const handleMeasureAllSkip = () => {
    if (measureAllStep < BODY_MEASUREMENT_TYPES.length - 1) {
      setMeasureAllStep(measureAllStep + 1);
    } else {
      setMeasureAllShowSummary(true);
    }
  };

  const handleMeasureAllBack = () => {
    if (measureAllShowSummary) {
      setMeasureAllShowSummary(false);
    } else if (measureAllStep > 0) {
      setMeasureAllStep(measureAllStep - 1);
    }
  };

  const saveMeasureAll = async () => {
    const measurements: { type: BodyMeasurementTypeKey; value: number }[] = [];

    for (const [key, valueStr] of Object.entries(measureAllValues)) {
      if (valueStr) {
        const value = parseFloat(valueStr);
        if (!isNaN(value) && value > 0) {
          const valueInInches = measurementInputToInches(value, userSettings.units);
          measurements.push({ type: key as BodyMeasurementTypeKey, value: valueInInches });
        }
      }
    }

    if (measurements.length === 0) {
      Alert.alert('No Measurements', 'Please enter at least one measurement');
      return;
    }

    setSaving(true);
    try {
      const saved = await addMultipleTypedMeasurements(measurements);
      for (const m of saved) {
        await syncBodyMeasurement(m);
      }
      setMeasureAllVisible(false);
      await loadData();
      Alert.alert('Success', `Saved ${saved.length} measurement${saved.length > 1 ? 's' : ''}`);
    } catch (error) {
      console.error('Failed to save measurements:', error);
      Alert.alert('Error', 'Failed to save measurements');
    } finally {
      setSaving(false);
    }
  };

  const getTrendIcon = (key: string) => {
    const trend = data.trends[key];
    if (trend === null) return null;

    const isPositive = isIncreasePositive(key);
    const color =
      trend === 'same'
        ? colors.textTertiary
        : (trend === 'up' && isPositive) || (trend === 'down' && !isPositive)
        ? colors.success
        : colors.error;

    return (
      <Text style={[styles.trendIcon, { color }]}>
        {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'}
      </Text>
    );
  };

  const groups = getGroupedMeasurements();

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Body Measurements</Text>
        <TouchableOpacity style={styles.measureAllButton} onPress={openMeasureAll}>
          <Text style={styles.measureAllText}>Measure All</Text>
        </TouchableOpacity>
      </View>

      {/* Measurement Groups */}
      {groups.map((group) => (
        <View key={group.label} style={styles.group}>
          <Text style={styles.groupLabel}>{group.label}</Text>
          <View style={styles.measurementGrid}>
            {group.measurements.map((type) => {
              const measurement = data.latest[type.key as BodyMeasurementTypeKey];
              const hasData = measurement?.value !== undefined;

              return (
                <TouchableOpacity
                  key={type.key}
                  style={styles.measurementCard}
                  onPress={() => (hasData ? onNavigateToHistory(type.key as BodyMeasurementTypeKey) : openQuickLog(type))}
                  onLongPress={() => openQuickLog(type)}
                >
                  <View style={styles.measurementHeader}>
                    <Text style={styles.measurementIcon}>{type.icon}</Text>
                    {hasData && getTrendIcon(type.key)}
                  </View>
                  <Text style={styles.measurementLabel}>{type.label}</Text>
                  {hasData ? (
                    <>
                      <Text style={styles.measurementValue}>
                        {formatMeasurement(measurement.value!, userSettings.units)}
                      </Text>
                      <Text style={styles.measurementDate}>
                        {format(new Date(measurement.date), 'MMM d')}
                      </Text>
                    </>
                  ) : (
                    <Text style={styles.measurementEmpty}>Tap to log</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ))}

      {/* Quick Log Modal */}
      <Modal
        visible={quickLogVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setQuickLogVisible(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setQuickLogVisible(false)}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>
              {selectedType?.icon} {selectedType?.label}
            </Text>
            <TouchableOpacity onPress={saveQuickLog} disabled={saving || !quickLogValue}>
              <Text style={[styles.modalSave, (!quickLogValue || saving) && styles.modalSaveDisabled]}>
                {saving ? 'Saving...' : 'Save'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.modalContent}>
            {selectedType && (
              <Text style={styles.instruction}>
                {MEASUREMENT_INSTRUCTIONS[selectedType.key]}
              </Text>
            )}

            {/* Last recorded value */}
            {selectedType && data.latest[selectedType.key as BodyMeasurementTypeKey]?.value && (
              <Text style={styles.lastValue}>
                Last: {formatMeasurement(data.latest[selectedType.key as BodyMeasurementTypeKey]!.value!, userSettings.units)} on{' '}
                {format(new Date(data.latest[selectedType.key as BodyMeasurementTypeKey]!.date), 'MMM d, yyyy')}
              </Text>
            )}

            {/* Value Input */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Value ({measurementUnit(userSettings.units)})</Text>
              <TextInput
                style={styles.input}
                value={quickLogValue}
                onChangeText={setQuickLogValue}
                placeholder={`Enter ${selectedType?.label.toLowerCase()}`}
                placeholderTextColor={colors.textTertiary}
                keyboardType="decimal-pad"
                autoFocus
              />
            </View>

            {/* Date Picker */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Date</Text>
              <TouchableOpacity
                style={styles.dateButton}
                onPress={() => setShowDatePicker(true)}
              >
                <Text style={styles.dateButtonText}>
                  {format(quickLogDate, 'MMMM d, yyyy')}
                </Text>
              </TouchableOpacity>
              {showDatePicker && (
                <DateTimePicker
                  value={quickLogDate}
                  mode="date"
                  display="spinner"
                  maximumDate={new Date()}
                  onChange={(event, date) => {
                    setShowDatePicker(false);
                    if (date) setQuickLogDate(date);
                  }}
                />
              )}
            </View>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Measure All Modal */}
      <Modal
        visible={measureAllVisible}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setMeasureAllVisible(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setMeasureAllVisible(false)}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>
              {measureAllShowSummary
                ? 'Summary'
                : `${measureAllStep + 1} of ${BODY_MEASUREMENT_TYPES.length}`}
            </Text>
            <View style={{ width: 50 }} />
          </View>

          {measureAllShowSummary ? (
            <ScrollView style={styles.modalContent}>
              <Text style={styles.summaryTitle}>Measurements to Save</Text>
              {Object.entries(measureAllValues)
                .filter(([, value]) => value)
                .map(([key, value]) => {
                  const type = BODY_MEASUREMENT_TYPES.find((t) => t.key === key);
                  return (
                    <View key={key} style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>
                        {type?.icon} {type?.label}
                      </Text>
                      <Text style={styles.summaryValue}>
                        {value} {measurementUnit(userSettings.units)}
                      </Text>
                    </View>
                  );
                })}

              {Object.values(measureAllValues).filter(Boolean).length === 0 && (
                <Text style={styles.emptyText}>No measurements entered</Text>
              )}

              <View style={styles.summaryButtons}>
                <TouchableOpacity style={styles.backButton} onPress={handleMeasureAllBack}>
                  <Text style={styles.backButtonText}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveAllButton, saving && styles.saveAllButtonDisabled]}
                  onPress={saveMeasureAll}
                  disabled={saving || Object.values(measureAllValues).filter(Boolean).length === 0}
                >
                  <Text style={styles.saveAllButtonText}>
                    {saving ? 'Saving...' : 'Save All'}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          ) : (
            <View style={styles.modalContent}>
              {(() => {
                const currentType = BODY_MEASUREMENT_TYPES[measureAllStep];
                const lastMeasurement = data.latest[currentType.key as BodyMeasurementTypeKey];

                return (
                  <>
                    <Text style={styles.measureAllIcon}>{currentType.icon}</Text>
                    <Text style={styles.measureAllLabel}>{currentType.label}</Text>
                    <Text style={styles.measureAllInstruction}>
                      {MEASUREMENT_INSTRUCTIONS[currentType.key]}
                    </Text>

                    {lastMeasurement?.value && (
                      <Text style={styles.measureAllLast}>
                        Last: {formatMeasurement(lastMeasurement.value, userSettings.units)} ({format(new Date(lastMeasurement.date), 'MMM d')})
                      </Text>
                    )}

                    <View style={styles.measureAllInputContainer}>
                      <TextInput
                        style={styles.measureAllInput}
                        value={measureAllValues[currentType.key] || ''}
                        onChangeText={(text) =>
                          setMeasureAllValues({ ...measureAllValues, [currentType.key]: text })
                        }
                        placeholder="0.0"
                        placeholderTextColor={colors.textTertiary}
                        keyboardType="decimal-pad"
                        autoFocus
                      />
                      <Text style={styles.measureAllUnit}>
                        {measurementUnit(userSettings.units)}
                      </Text>
                    </View>

                    <View style={styles.measureAllButtons}>
                      {measureAllStep > 0 && (
                        <TouchableOpacity style={styles.backButton} onPress={handleMeasureAllBack}>
                          <Text style={styles.backButtonText}>Back</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity style={styles.skipButton} onPress={handleMeasureAllSkip}>
                        <Text style={styles.skipButtonText}>Skip</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.nextButton} onPress={handleMeasureAllNext}>
                        <Text style={styles.nextButtonText}>
                          {measureAllStep === BODY_MEASUREMENT_TYPES.length - 1 ? 'Review' : 'Next'}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {/* Progress indicator */}
                    <View style={styles.progressContainer}>
                      {BODY_MEASUREMENT_TYPES.map((_, index) => (
                        <View
                          key={index}
                          style={[
                            styles.progressDot,
                            index === measureAllStep && styles.progressDotActive,
                            index < measureAllStep && styles.progressDotCompleted,
                          ]}
                        />
                      ))}
                    </View>
                  </>
                );
              })()}
            </View>
          )}
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.lg,
  },
  loadingContainer: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.text,
  },
  measureAllButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
  },
  measureAllText: {
    fontSize: typography.size.sm,
    color: colors.background,
    fontWeight: typography.weight.medium,
  },
  group: {
    marginBottom: spacing.md,
  },
  groupLabel: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  measurementGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  measurementCard: {
    width: '48%',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  measurementHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  measurementIcon: {
    fontSize: 16,
  },
  trendIcon: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
  },
  measurementLabel: {
    fontSize: typography.size.sm,
    color: colors.text,
    fontWeight: typography.weight.medium,
    marginBottom: spacing.xs,
  },
  measurementValue: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    color: colors.text,
  },
  measurementDate: {
    fontSize: typography.size.xs,
    color: colors.textTertiary,
    marginTop: 2,
  },
  measurementEmpty: {
    fontSize: typography.size.sm,
    color: colors.textTertiary,
    fontStyle: 'italic',
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
  modalSaveDisabled: {
    opacity: 0.5,
  },
  modalContent: {
    flex: 1,
    padding: spacing.base,
  },
  instruction: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
    fontStyle: 'italic',
  },
  lastValue: {
    fontSize: typography.size.sm,
    color: colors.textTertiary,
    textAlign: 'center',
    marginBottom: spacing.lg,
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
    fontSize: typography.size.xl,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.backgroundTertiary,
    textAlign: 'center',
  },
  dateButton: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.backgroundTertiary,
  },
  dateButtonText: {
    fontSize: typography.size.base,
    color: colors.text,
    textAlign: 'center',
  },
  // Measure All styles
  measureAllIcon: {
    fontSize: 64,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  measureAllLabel: {
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  measureAllInstruction: {
    fontSize: typography.size.base,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  measureAllLast: {
    fontSize: typography.size.sm,
    color: colors.textTertiary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  measureAllInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  measureAllInput: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: 48,
    fontWeight: typography.weight.bold,
    color: colors.text,
    width: 150,
    textAlign: 'center',
  },
  measureAllUnit: {
    fontSize: typography.size.xl,
    color: colors.textSecondary,
    marginLeft: spacing.sm,
  },
  measureAllButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  backButton: {
    backgroundColor: colors.backgroundSecondary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  backButtonText: {
    fontSize: typography.size.base,
    color: colors.textSecondary,
    fontWeight: typography.weight.medium,
  },
  skipButton: {
    backgroundColor: colors.backgroundSecondary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  skipButtonText: {
    fontSize: typography.size.base,
    color: colors.textSecondary,
    fontWeight: typography.weight.medium,
  },
  nextButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  nextButtonText: {
    fontSize: typography.size.base,
    color: colors.background,
    fontWeight: typography.weight.semibold,
  },
  progressContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.backgroundTertiary,
  },
  progressDotActive: {
    backgroundColor: colors.primary,
    width: 16,
  },
  progressDotCompleted: {
    backgroundColor: colors.primary,
    opacity: 0.5,
  },
  // Summary styles
  summaryTitle: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.backgroundTertiary,
  },
  summaryLabel: {
    fontSize: typography.size.base,
    color: colors.text,
  },
  summaryValue: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: colors.primary,
  },
  emptyText: {
    fontSize: typography.size.base,
    color: colors.textSecondary,
    textAlign: 'center',
    padding: spacing.xl,
  },
  summaryButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  saveAllButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  saveAllButtonDisabled: {
    opacity: 0.5,
  },
  saveAllButtonText: {
    fontSize: typography.size.base,
    color: colors.background,
    fontWeight: typography.weight.semibold,
  },
});

export default BodyMeasurementsSection;
