import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, borderRadius, commonStyles } from '../theme';
import { Card } from '../components/common';
import { useData } from '../contexts/DataContext';
import {
  parseRoutineJSON,
  buildPreview,
  importRoutine,
  ImportPreview,
  ImportRoutineData,
} from '../services/routineImport';
import { STARTER_ROUTINES } from '../data/starterRoutines';
import { RootStackParamList } from '../navigation/types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function ImportRoutineScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { exercises, locations, addExercise, addTemplate, addRoutine } = useData();

  const [rawText, setRawText] = useState('');
  const [parsed, setParsed] = useState<ImportRoutineData | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const handleParse = () => {
    setParseError(null);
    setPreview(null);
    setParsed(null);
    try {
      const data = parseRoutineJSON(rawText);
      const pv = buildPreview(data, exercises);
      setParsed(data);
      setPreview(pv);
    } catch (err: any) {
      setParseError(err?.message ?? String(err));
    }
  };

  const handleLoadStarter = (json: object) => {
    const text = JSON.stringify(json, null, 2);
    setRawText(text);
    setParseError(null);
    // Auto-parse so the user immediately sees the preview
    try {
      const data = parseRoutineJSON(text);
      setParsed(data);
      setPreview(buildPreview(data, exercises));
    } catch {
      // Ignore; the manual Parse button is still there
    }
  };

  const handleImport = async () => {
    if (!parsed) return;
    setImporting(true);
    try {
      const result = await importRoutine(parsed, {
        exercises,
        locations,
        addExercise,
        addTemplate,
        addRoutine,
      });
      Alert.alert(
        'Routine Imported',
        `"${result.routine.name}" added.\n` +
          `${result.templatesCreated} template${result.templatesCreated === 1 ? '' : 's'} · ` +
          `${result.exercisesMatched} matched · ${result.exercisesCreated} new exercise${result.exercisesCreated === 1 ? '' : 's'}.`,
        [
          {
            text: 'Open Routines',
            onPress: () => {
              navigation.replace('Routines');
            },
          },
          { text: 'Done', onPress: () => navigation.goBack() },
        ]
      );
    } catch (err: any) {
      Alert.alert('Import Failed', err?.message ?? 'Something went wrong while importing.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <SafeAreaView style={commonStyles.safeArea} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Import Routine</Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {/* Starter routines */}
          {STARTER_ROUTINES.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Suggested</Text>
              {STARTER_ROUTINES.map(routine => (
                <TouchableOpacity
                  key={routine.name}
                  style={styles.starterRow}
                  onPress={() => handleLoadStarter(routine)}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.starterName}>{routine.name}</Text>
                    {routine.notes ? (
                      <Text style={styles.starterNotes}>{routine.notes}</Text>
                    ) : null}
                    <Text style={styles.starterMeta}>
                      {routine.days.length} day{routine.days.length === 1 ? '' : 's'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* JSON input */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Paste JSON</Text>
            <TextInput
              style={styles.textArea}
              value={rawText}
              onChangeText={setRawText}
              placeholder='{ "name": "My Routine", "days": [ ... ] }'
              placeholderTextColor={colors.textTertiary}
              multiline
              autoCapitalize="none"
              autoCorrect={false}
              textAlignVertical="top"
            />
            {parseError && <Text style={styles.errorText}>{parseError}</Text>}
            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={styles.parseButton}
                onPress={handleParse}
                disabled={!rawText.trim()}
              >
                <Text style={styles.parseButtonText}>Parse</Text>
              </TouchableOpacity>
              {rawText.length > 0 && (
                <TouchableOpacity
                  style={styles.clearButton}
                  onPress={() => {
                    setRawText('');
                    setParsed(null);
                    setPreview(null);
                    setParseError(null);
                  }}
                >
                  <Text style={styles.clearButtonText}>Clear</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Preview */}
          {preview && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Preview</Text>
              <Card>
                <Text style={styles.previewName}>{preview.routineName}</Text>
                {preview.notes ? <Text style={styles.previewNotes}>{preview.notes}</Text> : null}
                <Text style={styles.previewMeta}>
                  {preview.days.length} day{preview.days.length === 1 ? '' : 's'} ·{' '}
                  {preview.days.reduce((sum, d) => sum + d.exercises.length, 0)} exercises
                </Text>
              </Card>

              {preview.days.map(day => {
                const matched = day.exercises.filter(e => e.matched).length;
                const newCount = day.exercises.length - matched;
                return (
                  <Card key={day.dayNumber} style={styles.dayCard}>
                    <View style={styles.dayHeader}>
                      <Text style={styles.dayTitle}>Day {day.dayNumber} · {day.name}</Text>
                      {day.locationName ? (
                        <Text style={styles.dayLocation}>{day.locationName}</Text>
                      ) : null}
                    </View>
                    <Text style={styles.dayCounts}>
                      {matched} matched · {newCount} new
                    </Text>
                    {day.exercises.map((ex, i) => (
                      <View key={`${day.dayNumber}-${i}`} style={styles.exerciseRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.exerciseName}>{ex.name}</Text>
                          <Text style={styles.exerciseMeta}>
                            {ex.sets}×{ex.reps ?? '?'}
                            {ex.unilateral ? ' · unilateral' : ''}
                            {!ex.matched ? ` · new (${ex.inferredEquipment})` : ''}
                          </Text>
                        </View>
                        <Text style={ex.matched ? styles.statusMatched : styles.statusNew}>
                          {ex.matched ? '✓' : '+'}
                        </Text>
                      </View>
                    ))}
                  </Card>
                );
              })}

              <TouchableOpacity
                style={[styles.importButton, importing && styles.importButtonDisabled]}
                onPress={handleImport}
                disabled={importing}
              >
                {importing ? (
                  <ActivityIndicator color={colors.textOnPrimary} />
                ) : (
                  <Text style={styles.importButtonText}>Import Routine</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.backgroundTertiary,
  },
  cancelText: { fontSize: typography.size.md, color: colors.textSecondary },
  title: { fontSize: typography.size.lg, fontWeight: typography.weight.semibold, color: colors.text },
  placeholder: { width: 50 },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.base, paddingBottom: spacing.xxl },
  section: { marginBottom: spacing.lg },
  sectionTitle: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  starterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  starterName: { fontSize: typography.size.md, fontWeight: typography.weight.semibold, color: colors.text },
  starterNotes: { fontSize: typography.size.sm, color: colors.textSecondary, marginTop: 2 },
  starterMeta: { fontSize: typography.size.xs, color: colors.textTertiary, marginTop: 4 },
  textArea: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    color: colors.text,
    fontSize: typography.size.sm,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
    minHeight: 160,
    borderWidth: 1,
    borderColor: colors.backgroundTertiary,
  },
  errorText: {
    color: colors.error,
    fontSize: typography.size.sm,
    marginTop: spacing.sm,
  },
  actionsRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  parseButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  parseButtonText: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.textOnPrimary,
  },
  clearButton: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    backgroundColor: colors.backgroundTertiary,
    alignItems: 'center',
  },
  clearButtonText: { color: colors.text, fontSize: typography.size.md },
  previewName: { fontSize: typography.size.lg, fontWeight: typography.weight.semibold, color: colors.text },
  previewNotes: { fontSize: typography.size.sm, color: colors.textSecondary, marginTop: spacing.xs },
  previewMeta: { fontSize: typography.size.sm, color: colors.textTertiary, marginTop: spacing.xs },
  dayCard: { marginTop: spacing.sm },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dayTitle: { fontSize: typography.size.md, fontWeight: typography.weight.semibold, color: colors.text, flex: 1 },
  dayLocation: { fontSize: typography.size.xs, color: colors.textSecondary },
  dayCounts: { fontSize: typography.size.xs, color: colors.textTertiary, marginTop: 2, marginBottom: spacing.sm },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },
  exerciseName: { fontSize: typography.size.md, color: colors.text },
  exerciseMeta: { fontSize: typography.size.xs, color: colors.textSecondary, marginTop: 2 },
  statusMatched: { color: colors.success, fontSize: typography.size.md, fontWeight: typography.weight.semibold },
  statusNew: { color: colors.primary, fontSize: typography.size.md, fontWeight: typography.weight.semibold },
  importButton: {
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  importButtonDisabled: { opacity: 0.6 },
  importButtonText: {
    color: colors.textOnPrimary,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
  },
});

export default ImportRoutineScreen;
