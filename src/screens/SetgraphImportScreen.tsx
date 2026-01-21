import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { colors, typography, spacing, borderRadius, commonStyles } from '../theme';
import { Button, Card } from '../components/common';
import { useData } from '../contexts/DataContext';
import {
  parseSetgraphCSV,
  getUniqueSetgraphExercises,
  createDefaultMappings,
  importSetgraphData,
  validateSetgraphCSV,
} from '../services/setgraphImport';
import { SetgraphExerciseMapping } from '../types';

export function SetgraphImportScreen() {
  const navigation = useNavigation();
  const { exercises, refreshAll } = useData();

  const [csvContent, setCsvContent] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [mappings, setMappings] = useState<SetgraphExerciseMapping[]>([]);
  const [showMappings, setShowMappings] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    rowCount: number;
    errors: string[];
  } | null>(null);

  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'application/csv', '*/*'],
        copyToCacheDirectory: true,
      });

      if (result.canceled) {
        return;
      }

      const file = result.assets[0];
      setFileName(file.name);

      // Read file content
      const content = await FileSystem.readAsStringAsync(file.uri);
      setCsvContent(content);

      // Auto-validate after picking file
      setIsValidating(true);
      try {
        const validationResult = validateSetgraphCSV(content);
        setValidationResult(validationResult);

        if (validationResult.valid) {
          const rows = parseSetgraphCSV(content);
          const uniqueExercises = getUniqueSetgraphExercises(rows);
          const defaultMappings = createDefaultMappings(uniqueExercises, exercises);
          setMappings(defaultMappings);
          setShowMappings(true);
        }
      } catch (error) {
        Alert.alert('Validation Error', `Failed to validate CSV: ${error}`);
      } finally {
        setIsValidating(false);
      }
    } catch (error) {
      Alert.alert('Error', `Failed to read file: ${error}`);
    }
  };

  const handleValidate = async () => {
    if (!csvContent.trim()) {
      Alert.alert('Error', 'Please paste your Setgraph CSV data');
      return;
    }

    setIsValidating(true);
    try {
      const result = validateSetgraphCSV(csvContent);
      setValidationResult(result);

      if (result.valid) {
        const rows = parseSetgraphCSV(csvContent);
        const uniqueExercises = getUniqueSetgraphExercises(rows);
        const defaultMappings = createDefaultMappings(uniqueExercises, exercises);
        setMappings(defaultMappings);
        setShowMappings(true);
      }
    } catch (error) {
      Alert.alert('Validation Error', `Failed to validate CSV: ${error}`);
    } finally {
      setIsValidating(false);
    }
  };

  const handleImport = async () => {
    setIsImporting(true);
    try {
      const rows = parseSetgraphCSV(csvContent);
      const result = await importSetgraphData(rows, mappings);

      await refreshAll();

      Alert.alert(
        'Import Complete',
        `Created ${result.workoutsCreated} workouts with ${result.setsCreated} sets.\n${result.exercisesCreated} new exercises were added.${result.errors.length > 0 ? `\n\n${result.errors.length} errors occurred.` : ''}`,
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (error) {
      Alert.alert('Import Error', `Failed to import data: ${error}`);
    } finally {
      setIsImporting(false);
    }
  };

  const unmappedCount = mappings.filter(m => m.needsMapping).length;

  return (
    <SafeAreaView style={commonStyles.safeArea} edges={['top']}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Import from Setgraph</Text>
        <Text style={styles.description}>
          Import your Setgraph CSV export. You can pick a file from your device or paste
          the data directly.
        </Text>

        {/* File Picker and CSV Input */}
        {!showMappings && (
          <>
            {/* File Picker */}
            <TouchableOpacity style={styles.filePickerButton} onPress={handlePickFile}>
              <Text style={styles.filePickerIcon}>📁</Text>
              <View style={styles.filePickerText}>
                <Text style={styles.filePickerTitle}>
                  {fileName ? fileName : 'Select CSV File'}
                </Text>
                <Text style={styles.filePickerSubtitle}>
                  {fileName ? 'Tap to select a different file' : 'From Files, iCloud, or email attachment'}
                </Text>
              </View>
            </TouchableOpacity>

            {/* Or divider */}
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or paste manually</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Manual paste */}
            <Card style={styles.section}>
              <Text style={styles.label}>Paste CSV Data</Text>
              <TextInput
                style={styles.csvInput}
                value={csvContent}
                onChangeText={(text) => {
                  setCsvContent(text);
                  setFileName(null);
                }}
                placeholder="Paste your CSV content here..."
                placeholderTextColor={colors.textTertiary}
                multiline
                numberOfLines={8}
                textAlignVertical="top"
              />
              <Button
                title={isValidating ? 'Validating...' : 'Validate Data'}
                onPress={handleValidate}
                disabled={isValidating || !csvContent.trim()}
                fullWidth
                style={styles.validateButton}
              />
            </Card>
          </>
        )}

        {/* Validation Result */}
        {validationResult && (
          <Card style={styles.section}>
            <Text style={styles.label}>Validation Result</Text>
            <View style={styles.resultRow}>
              <Text style={styles.resultLabel}>Rows found:</Text>
              <Text style={styles.resultValue}>{validationResult.rowCount}</Text>
            </View>
            <View style={styles.resultRow}>
              <Text style={styles.resultLabel}>Status:</Text>
              <Text style={[styles.resultValue, validationResult.valid ? styles.success : styles.error]}>
                {validationResult.valid ? 'Valid' : 'Invalid'}
              </Text>
            </View>
            {validationResult.errors.length > 0 && (
              <View style={styles.errorList}>
                {validationResult.errors.map((error, index) => (
                  <Text key={index} style={styles.errorText}>• {error}</Text>
                ))}
              </View>
            )}
          </Card>
        )}

        {/* Mappings */}
        {showMappings && (
          <>
            <Card style={styles.section}>
              <Text style={styles.label}>Exercise Mappings</Text>
              <Text style={styles.mappingInfo}>
                {mappings.length} exercises found • {unmappedCount} will be created
              </Text>

              {mappings.map((mapping, index) => (
                <View key={index} style={styles.mappingRow}>
                  <Text style={styles.mappingName}>{mapping.setgraphName}</Text>
                  <Text style={[styles.mappingStatus, mapping.needsMapping && styles.mappingNew]}>
                    {mapping.needsMapping ? 'New' : 'Matched'}
                  </Text>
                </View>
              ))}
            </Card>

            {/* Import Button */}
            <Button
              title={isImporting ? 'Importing...' : 'Import Data'}
              onPress={handleImport}
              disabled={isImporting}
              fullWidth
              size="large"
            />

            {isImporting && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.loadingText}>Importing your workout history...</Text>
              </View>
            )}
          </>
        )}
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
  title: {
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  description: {
    fontSize: typography.size.base,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
    lineHeight: 22,
  },
  filePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 2,
    borderColor: colors.primary,
    borderStyle: 'dashed',
  },
  filePickerIcon: {
    fontSize: 32,
    marginRight: spacing.md,
  },
  filePickerText: {
    flex: 1,
  },
  filePickerTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.text,
  },
  filePickerSubtitle: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.separator,
  },
  dividerText: {
    fontSize: typography.size.sm,
    color: colors.textTertiary,
    marginHorizontal: spacing.md,
  },
  section: {
    marginBottom: spacing.lg,
  },
  label: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.md,
  },
  csvInput: {
    backgroundColor: colors.backgroundTertiary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: typography.size.sm,
    color: colors.text,
    minHeight: 200,
    fontFamily: 'monospace',
  },
  validateButton: {
    marginTop: spacing.md,
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  resultLabel: {
    fontSize: typography.size.base,
    color: colors.textSecondary,
  },
  resultValue: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.medium,
    color: colors.text,
  },
  success: {
    color: colors.success,
  },
  error: {
    color: colors.error,
  },
  errorList: {
    marginTop: spacing.md,
  },
  errorText: {
    fontSize: typography.size.sm,
    color: colors.error,
    marginBottom: spacing.xs,
  },
  mappingInfo: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  mappingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  mappingName: {
    fontSize: typography.size.sm,
    color: colors.text,
    flex: 1,
  },
  mappingStatus: {
    fontSize: typography.size.xs,
    color: colors.success,
    fontWeight: typography.weight.medium,
  },
  mappingNew: {
    color: colors.warning,
  },
  loadingContainer: {
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  loadingText: {
    fontSize: typography.size.base,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
});

export default SetgraphImportScreen;
