import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, borderRadius } from '../../theme';
import { Button } from '../common';
import { useData } from '../../contexts/DataContext';
import {
  getRequiredSites,
  calculateBodyFat,
  isBodyFatError,
  calculateAge,
  SkinfoldSites,
  SkinfoldSiteKey,
  SKINFOLD_SITE_INFO,
} from '../../services/bodyFatCalculator';
import { BodyFatFormula, BiologicalSex } from '../../types';

interface CaliperTestModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (bodyFatPercentage: number, skinfoldMeasurements: Record<string, number>) => void;
  currentBodyWeight?: number; // in lbs, needed for Parillo formula
}

export function CaliperTestModal({
  visible,
  onClose,
  onSave,
  currentBodyWeight,
}: CaliperTestModalProps) {
  const { userSettings } = useData();
  const formula = userSettings.bodyFatFormula || 'jp3';
  const sex = userSettings.biologicalSex || 'male';
  const birthYear = userSettings.birthYear;

  const requiredSites = getRequiredSites(formula, sex);
  const [currentStep, setCurrentStep] = useState(0);
  const [measurements, setMeasurements] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ percentage: number; method: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      setCurrentStep(0);
      setMeasurements({});
      setResult(null);
      setError(null);
    }
  }, [visible]);

  const currentSite = requiredSites[currentStep];
  const siteInfo = currentSite ? SKINFOLD_SITE_INFO[currentSite] : null;
  const isLastSite = currentStep === requiredSites.length - 1;
  const showResult = currentStep === requiredSites.length;

  const getCurrentValue = () => measurements[currentSite] || '';

  const handleValueChange = (text: string) => {
    // Only allow numbers and decimal point
    const cleaned = text.replace(/[^0-9.]/g, '');
    setMeasurements({ ...measurements, [currentSite]: cleaned });
    setError(null);
  };

  const handleNext = () => {
    const value = parseFloat(measurements[currentSite] || '0');
    if (value <= 0) {
      setError('Please enter a measurement');
      return;
    }

    if (isLastSite) {
      // Calculate result
      calculateResult();
    } else {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
      setResult(null);
    }
  };

  const calculateResult = () => {
    if (!birthYear) {
      setError('Birth year required in Settings');
      return;
    }

    const age = calculateAge(birthYear);
    const sites: SkinfoldSites = {};

    // Convert measurement strings to numbers
    for (const site of requiredSites) {
      const siteKey = site as SkinfoldSiteKey;
      sites[siteKey] = parseFloat(measurements[site] || '0');
    }

    const calcResult = calculateBodyFat(formula, sex, age, sites, currentBodyWeight);

    if (isBodyFatError(calcResult)) {
      setError(calcResult.error);
    } else {
      setResult(calcResult);
      setCurrentStep(requiredSites.length); // Move to result view
    }
  };

  const handleSave = () => {
    if (result) {
      // Convert measurements to number record with skinfold_ prefix
      const skinfoldMeasurements: Record<string, number> = {};
      for (const [site, value] of Object.entries(measurements)) {
        skinfoldMeasurements[`skinfold_${site}`] = parseFloat(value);
      }
      onSave(result.percentage, skinfoldMeasurements);
    }
  };

  const canProceed = () => {
    const value = parseFloat(measurements[currentSite] || '0');
    return value > 0;
  };

  // Check if settings are configured
  if (!sex || !birthYear) {
    return (
      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.container}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Caliper Test</Text>
            <View style={styles.closeButton} />
          </View>

          <View style={styles.setupRequired}>
            <Text style={styles.setupTitle}>Setup Required</Text>
            <Text style={styles.setupDescription}>
              Please configure your biological sex and birth year in Settings before taking a caliper test.
            </Text>
            <Button
              title="Close"
              onPress={onClose}
              variant="primary"
              style={{ marginTop: spacing.lg }}
            />
          </View>
        </SafeAreaView>
      </Modal>
    );
  }

  // Result view
  if (showResult && result) {
    return (
      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.container}>
          <View style={styles.header}>
            <TouchableOpacity onPress={handleBack} style={styles.closeButton}>
              <Text style={styles.closeText}>Back</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Result</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeText}>Done</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.resultContainer}>
            <View style={styles.resultCard}>
              <Text style={styles.resultLabel}>Body Fat Percentage</Text>
              <Text style={styles.resultValue}>{result.percentage}%</Text>
              <Text style={styles.resultMethod}>{result.method}</Text>
            </View>

            <View style={styles.measurementsSummary}>
              <Text style={styles.summaryTitle}>Measurements (mm)</Text>
              {requiredSites.map((site) => (
                <View key={site} style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>{SKINFOLD_SITE_INFO[site].label}</Text>
                  <Text style={styles.summaryValue}>{measurements[site]}</Text>
                </View>
              ))}
            </View>

            <Button
              title="Save Result"
              onPress={handleSave}
              variant="primary"
              fullWidth
              style={{ marginTop: spacing.xl }}
            />
          </View>
        </SafeAreaView>
      </Modal>
    );
  }

  // Measurement step view
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          style={styles.keyboardView}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.header}>
            <TouchableOpacity onPress={currentStep > 0 ? handleBack : onClose} style={styles.closeButton}>
              <Text style={styles.closeText}>{currentStep > 0 ? 'Back' : 'Cancel'}</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Caliper Test</Text>
            <View style={styles.closeButton}>
              <Text style={styles.stepCounter}>{currentStep + 1}/{requiredSites.length}</Text>
            </View>
          </View>

          <ScrollView style={styles.scrollContent} contentContainerStyle={styles.scrollContentInner}>
            <View style={styles.siteContainer}>
              <Text style={styles.siteName}>{siteInfo?.label}</Text>
              <Text style={styles.siteInstruction}>{siteInfo?.instruction}</Text>
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Measurement (mm)</Text>
              <TextInput
                style={styles.input}
                value={getCurrentValue()}
                onChangeText={handleValueChange}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={colors.textTertiary}
                autoFocus
              />
              {error && <Text style={styles.errorText}>{error}</Text>}
            </View>

            <View style={styles.tipContainer}>
              <Text style={styles.tipTitle}>Measurement Tips</Text>
              <Text style={styles.tipText}>
                {'\u2022'} Pinch the skin firmly between thumb and forefinger{'\n'}
                {'\u2022'} Place caliper jaws 1cm below fingers{'\n'}
                {'\u2022'} Read measurement after 2-3 seconds{'\n'}
                {'\u2022'} Take 2-3 readings and use the average
              </Text>
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <Button
              title={isLastSite ? 'Calculate' : 'Next'}
              onPress={handleNext}
              variant="primary"
              fullWidth
              disabled={!canProceed()}
            />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  headerTitle: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.text,
  },
  closeButton: {
    minWidth: 60,
  },
  closeText: {
    fontSize: typography.size.md,
    color: colors.primary,
  },
  stepCounter: {
    fontSize: typography.size.md,
    color: colors.textSecondary,
    textAlign: 'right',
  },
  scrollContent: {
    flex: 1,
  },
  scrollContentInner: {
    padding: spacing.base,
  },
  siteContainer: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  siteName: {
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold,
    color: colors.text,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  siteInstruction: {
    fontSize: typography.size.md,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  inputContainer: {
    marginBottom: spacing.lg,
  },
  inputLabel: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.base,
    fontSize: typography.size.xxxl,
    fontWeight: typography.weight.bold,
    color: colors.text,
    textAlign: 'center',
  },
  errorText: {
    fontSize: typography.size.sm,
    color: colors.error,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  tipContainer: {
    backgroundColor: colors.backgroundTertiary,
    borderRadius: borderRadius.md,
    padding: spacing.base,
  },
  tipTitle: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  tipText: {
    fontSize: typography.size.sm,
    color: colors.textTertiary,
    lineHeight: 20,
  },
  footer: {
    padding: spacing.base,
    paddingBottom: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },
  setupRequired: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  setupTitle: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  setupDescription: {
    fontSize: typography.size.md,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  resultContainer: {
    flex: 1,
    padding: spacing.base,
  },
  resultCard: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  resultLabel: {
    fontSize: typography.size.sm,
    color: colors.textOnPrimary,
    opacity: 0.8,
    marginBottom: spacing.sm,
  },
  resultValue: {
    fontSize: 64,
    fontWeight: typography.weight.bold,
    color: colors.textOnPrimary,
  },
  resultMethod: {
    fontSize: typography.size.md,
    color: colors.textOnPrimary,
    opacity: 0.8,
    marginTop: spacing.sm,
  },
  measurementsSummary: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    padding: spacing.base,
  },
  summaryTitle: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  summaryLabel: {
    fontSize: typography.size.md,
    color: colors.text,
  },
  summaryValue: {
    fontSize: typography.size.md,
    color: colors.textSecondary,
    fontWeight: typography.weight.medium,
  },
});

export default CaliperTestModal;
