/**
 * Analytics -> Body scans: the latest InBody / DEXA scan, a form to enter one,
 * and history charts for skeletal muscle mass and visceral fat.
 */
import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  ScrollView,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { format, parseISO } from 'date-fns';
import { colors, typography, spacing, borderRadius } from '../../theme';
import { Card } from '../common';
import { MiniLineChart } from '../charts/MiniLineChart';
import { useData } from '../../contexts/DataContext';
import { scanMeasurement, scanSeries, scans, type ScanInput } from '../../services/bodyComposition';
import type { ScanType } from '../../types';

const CHART_WIDTH = Dimensions.get('window').width - spacing.base * 4;

const FIELDS: Array<{ key: keyof Omit<ScanInput, 'date' | 'scanType'>; label: string; unit: string }> = [
  { key: 'weight', label: 'Weight', unit: 'lb' },
  { key: 'bodyFatPercentage', label: 'Body fat', unit: '%' },
  { key: 'skeletalMuscleLbs', label: 'Skeletal muscle', unit: 'lb' },
  { key: 'leanMassLbs', label: 'Lean mass', unit: 'lb' },
  { key: 'visceralFatArea', label: 'Visceral fat area', unit: 'cm²' },
  { key: 'ecwTbw', label: 'ECW / TBW', unit: '' },
  { key: 'phaseAngle', label: 'Phase angle', unit: '°' },
];

const SCAN_TYPES: Array<{ value: ScanType; label: string }> = [
  { value: 'inbody', label: 'InBody' },
  { value: 'dexa', label: 'DEXA' },
  { value: 'scale', label: 'Scale' },
];

const todayYmd = () => format(new Date(), 'yyyy-MM-dd');

export function BodyScanCard() {
  const { bodyMeasurements, addBodyMeasurement, updateBodyMeasurement } = useData();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayYmd());
  const [scanType, setScanType] = useState<ScanType>('inbody');
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const all = useMemo(() => scans(bodyMeasurements), [bodyMeasurements]);
  const latest = all[all.length - 1];
  const muscle = useMemo(() => scanSeries(bodyMeasurements, 'skeletalMuscleLbs'), [bodyMeasurements]);
  const visceral = useMemo(() => scanSeries(bodyMeasurements, 'visceralFatArea'), [bodyMeasurements]);

  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(parseISO(date).getTime());
  const parsed = Object.fromEntries(
    FIELDS.map(f => [f.key, values[f.key] ? Number(values[f.key]!.replace(',', '.')) : undefined]),
  ) as Partial<ScanInput>;
  const anyValue = Object.values(parsed).some(v => typeof v === 'number' && Number.isFinite(v));

  const openForm = () => {
    setDate(todayYmd());
    setScanType('inbody');
    setValues({});
    setOpen(true);
  };

  const save = async () => {
    if (!validDate || !anyValue) return;
    setSaving(true);
    try {
      const row = scanMeasurement({ date, scanType, ...parsed }, bodyMeasurements);
      const exists = bodyMeasurements.some(m => m.id === row.id);
      if (exists) await updateBodyMeasurement(row);
      else await addBodyMeasurement(row);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const stat = (label: string, value: number | undefined, unit: string, decimals = 1) => (
    <View style={styles.stat} key={label}>
      <Text style={styles.statValue}>{typeof value === 'number' ? `${value.toFixed(decimals)}${unit ? ` ${unit}` : ''}` : '—'}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.title}>Body Scans</Text>
        <TouchableOpacity style={styles.addButton} onPress={openForm} testID="body-scan-add">
          <Text style={styles.addButtonText}>+ Scan</Text>
        </TouchableOpacity>
      </View>

      <Card>
        {latest ? (
          <>
            <Text style={styles.subtle}>
              {(SCAN_TYPES.find(t => t.value === latest.scanType)?.label ?? 'Scan')} · {format(parseISO(latest.date), 'MMM d, yyyy')}
            </Text>
            <View style={styles.statGrid}>
              {stat('Weight', latest.weight, 'lb')}
              {stat('Body fat', latest.bodyFatPercentage, '%')}
              {stat('Skeletal muscle', latest.skeletalMuscleLbs, 'lb')}
              {stat('Lean mass', latest.leanMassLbs, 'lb')}
              {stat('Visceral fat', latest.visceralFatArea, 'cm²')}
              {stat('ECW / TBW', latest.ecwTbw, '', 3)}
              {stat('Phase angle', latest.phaseAngle, '°')}
            </View>
            <Text style={styles.chartTitle}>Skeletal muscle (lb)</Text>
            <MiniLineChart points={muscle} width={CHART_WIDTH} emptyText="No muscle mass logged" />
            <Text style={styles.chartTitle}>Visceral fat area (cm²)</Text>
            <MiniLineChart points={visceral} width={CHART_WIDTH} color={colors.warning} emptyText="No visceral fat logged" />
          </>
        ) : (
          <Text style={styles.subtle}>No scans yet. Tap “+ Scan” to enter an InBody or DEXA result.</Text>
        )}
      </Card>

      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={styles.modal}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setOpen(false)}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Body scan</Text>
            <TouchableOpacity onPress={save} disabled={saving || !anyValue || !validDate} testID="body-scan-save">
              <Text style={[styles.modalSave, (saving || !anyValue || !validDate) && styles.modalSaveDisabled]}>
                {saving ? 'Saving…' : 'Save'}
              </Text>
            </TouchableOpacity>
          </View>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
            <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
              <View style={styles.segment}>
                {SCAN_TYPES.map(t => (
                  <TouchableOpacity
                    key={t.value}
                    style={[styles.segmentItem, scanType === t.value && styles.segmentItemOn]}
                    onPress={() => setScanType(t.value)}
                  >
                    <Text style={[styles.segmentText, scanType === t.value && styles.segmentTextOn]}>{t.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Date</Text>
                <TextInput
                  style={[styles.input, !validDate && styles.inputBad]}
                  value={date}
                  onChangeText={setDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.textTertiary}
                  autoCapitalize="none"
                />
              </View>
              {FIELDS.map(f => (
                <View style={styles.row} key={f.key}>
                  <Text style={styles.rowLabel}>
                    {f.label}
                    {f.unit ? ` (${f.unit})` : ''}
                  </Text>
                  <TextInput
                    style={styles.input}
                    value={values[f.key] ?? ''}
                    onChangeText={v => setValues(prev => ({ ...prev, [f.key]: v }))}
                    keyboardType="decimal-pad"
                    placeholder="—"
                    placeholderTextColor={colors.textTertiary}
                    testID={`body-scan-${f.key}`}
                  />
                </View>
              ))}
              <Text style={styles.hint}>
                A scan on a day that already has a weigh-in replaces that day’s weight. Leave anything you don’t have blank.
              </Text>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  section: { marginBottom: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  title: { fontSize: typography.size.lg, fontWeight: typography.weight.semibold, color: colors.text },
  addButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
  },
  addButtonText: { color: colors.textOnPrimary, fontWeight: typography.weight.semibold, fontSize: typography.size.sm },
  subtle: { fontSize: typography.size.sm, color: colors.textSecondary },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.sm },
  stat: { width: '33%', paddingVertical: spacing.xs },
  statValue: { fontSize: typography.size.md, fontWeight: typography.weight.semibold, color: colors.text },
  statLabel: { fontSize: typography.size.xs, color: colors.textSecondary },
  chartTitle: { fontSize: typography.size.sm, color: colors.textSecondary, marginTop: spacing.md, marginBottom: spacing.xs },
  modal: { flex: 1, backgroundColor: colors.background },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.base,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  modalTitle: { fontSize: typography.size.md, fontWeight: typography.weight.semibold, color: colors.text },
  modalCancel: { fontSize: typography.size.md, color: colors.textSecondary },
  modalSave: { fontSize: typography.size.md, color: colors.primary, fontWeight: typography.weight.semibold },
  modalSaveDisabled: { opacity: 0.4 },
  modalContent: { padding: spacing.base, paddingBottom: spacing.xxxl },
  segment: {
    flexDirection: 'row',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  segmentItem: { flex: 1, paddingVertical: spacing.sm, alignItems: 'center' },
  segmentItemOn: { backgroundColor: colors.primary },
  segmentText: { color: colors.textSecondary, fontSize: typography.size.sm },
  segmentTextOn: { color: colors.textOnPrimary, fontWeight: typography.weight.semibold },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  rowLabel: { fontSize: typography.size.md, color: colors.text, flex: 1 },
  input: {
    minWidth: 120,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.backgroundTertiary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text,
    fontSize: typography.size.md,
    textAlign: 'right',
  },
  inputBad: { borderColor: colors.error },
  hint: { fontSize: typography.size.sm, color: colors.textSecondary, marginTop: spacing.md },
});
