/**
 * Settings -> Health Reminders: full create / edit / check-off / delete for the
 * "Next draws" card. Seeded rows are ordinary rows here.
 */
import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, TextInput, Alert, Platform, Switch } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { colors, typography, spacing, commonStyles } from '../theme';
import { Button, Card } from '../components/common';
import { openReminders } from '../services/healthDashboard';
import {
  createReminder,
  deleteReminder,
  getLocalReminders,
  loadReminders,
  saveReminder,
  setReminderDone,
} from '../services/healthReminders';
import type { HealthReminder } from '../types';

function ReminderEditor({
  reminder,
  onClose,
  onSaved,
}: {
  reminder: HealthReminder | 'new';
  onClose: () => void;
  onSaved: () => void;
}) {
  const existing = reminder === 'new' ? null : reminder;
  const [title, setTitle] = useState(existing?.title ?? '');
  const [detail, setDetail] = useState(existing?.detail ?? '');
  const [hasDate, setHasDate] = useState(!!existing?.dueDate);
  const [date, setDate] = useState<Date>(existing?.dueDate ? parseISO(existing.dueDate) : new Date());
  const [showAndroidPicker, setShowAndroidPicker] = useState(false);

  const save = async () => {
    const dueDate = hasDate ? format(date, 'yyyy-MM-dd') : null;
    const cleanDetail = detail.trim() || null;
    if (existing) await saveReminder({ ...existing, title: title.trim(), detail: cleanDetail, dueDate });
    else await createReminder({ title, detail: cleanDetail, dueDate });
    onSaved();
  };

  const remove = () => {
    if (!existing) return;
    Alert.alert('Delete reminder?', existing.title, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteReminder(existing.id);
          onSaved();
        },
      },
    ]);
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView style={styles.modal} contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.modalCancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.modalTitle}>{existing ? 'Edit reminder' : 'New reminder'}</Text>
          <TouchableOpacity onPress={save} disabled={!title.trim()}>
            <Text style={[styles.modalSave, !title.trim() && styles.disabled]}>Save</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.fieldLabel}>Title</Text>
        <TextInput
          style={commonStyles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. Vitamin D recheck"
          placeholderTextColor={colors.textTertiary}
        />
        <Text style={styles.fieldLabel}>Detail</Text>
        <TextInput
          style={[commonStyles.input, styles.multiline]}
          value={detail}
          onChangeText={setDetail}
          placeholder="Why, last value, who ordered it"
          placeholderTextColor={colors.textTertiary}
          multiline
        />

        <View style={styles.switchRow}>
          <View style={styles.flex}>
            <Text style={styles.fieldLabelInline}>Due date</Text>
            <Text style={styles.hint}>{hasDate ? format(date, 'MMM d, yyyy') : 'No date — shows as due now'}</Text>
          </View>
          <Switch value={hasDate} onValueChange={setHasDate} trackColor={{ true: colors.primary, false: colors.backgroundTertiary }} />
        </View>
        {hasDate &&
          (Platform.OS === 'ios' ? (
            <DateTimePicker value={date} mode="date" display="inline" themeVariant="dark" onChange={(_, d) => d && setDate(d)} />
          ) : (
            <>
              <Button title="Pick date" variant="secondary" onPress={() => setShowAndroidPicker(true)} />
              {showAndroidPicker && (
                <DateTimePicker
                  value={date}
                  mode="date"
                  onChange={(_, d) => {
                    setShowAndroidPicker(false);
                    if (d) setDate(d);
                  }}
                />
              )}
            </>
          ))}

        {existing && <Button title="Delete reminder" variant="destructive" onPress={remove} style={styles.deleteButton} />}
      </ScrollView>
    </Modal>
  );
}

export function HealthRemindersScreen() {
  const [list, setList] = useState<HealthReminder[] | null>(null);
  const [editing, setEditing] = useState<HealthReminder | 'new' | null>(null);

  const reload = useCallback(async () => {
    try {
      setList(await loadReminders());
    } catch {
      setList(await getLocalReminders());
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const toggleDone = async (reminder: HealthReminder) => {
    await setReminderDone(reminder.id, !reminder.doneAt);
    setList(await getLocalReminders());
  };

  const open = list ? openReminders(list, new Date()) : [];
  const done = (list ?? []).filter(r => r.doneAt).sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? ''));

  const renderRow = (reminder: HealthReminder, dueLabel: string, isDone: boolean, index: number) => (
    <TouchableOpacity
      key={reminder.id}
      style={[styles.row, index > 0 && styles.rowBorder]}
      onPress={() => setEditing(reminder)}
      activeOpacity={0.7}
    >
      <TouchableOpacity
        onPress={() => toggleDone(reminder)}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: isDone }}
      >
        <Ionicons name={isDone ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={isDone ? colors.healthGood : colors.textSecondary} />
      </TouchableOpacity>
      <View style={styles.flex}>
        <Text style={[styles.rowTitle, isDone && styles.rowTitleDone]}>{reminder.title}</Text>
        {reminder.detail ? <Text style={styles.hint}>{reminder.detail}</Text> : null}
        <Text style={styles.due}>{dueLabel}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );

  return (
    <ScrollView style={commonStyles.container} contentContainerStyle={styles.content}>
      <Button title="Add reminder" onPress={() => setEditing('new')} fullWidth />

      <Text style={styles.sectionTitle}>Open</Text>
      <Card padding="none">
        {list === null ? (
          <Text style={styles.empty}>Loading…</Text>
        ) : open.length === 0 ? (
          <Text style={styles.empty}>Nothing open.</Text>
        ) : (
          open.map((v, i) => renderRow(v.reminder, v.dueLabel, false, i))
        )}
      </Card>

      {done.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Done</Text>
          <Card padding="none">
            {done.map((r, i) => renderRow(r, `Done ${format(new Date(r.doneAt!), 'MMM d, yyyy')}`, true, i))}
          </Card>
        </>
      )}

      {editing && (
        <ReminderEditor
          reminder={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            setList(await getLocalReminders());
          }}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.base,
    paddingBottom: spacing.xxxl,
  },
  sectionTitle: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  empty: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    padding: spacing.base,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.base,
  },
  rowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },
  flex: {
    flex: 1,
  },
  rowTitle: {
    fontSize: typography.size.base,
    color: colors.text,
  },
  rowTitleDone: {
    color: colors.textSecondary,
    textDecorationLine: 'line-through',
  },
  hint: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  due: {
    fontSize: typography.size.xs,
    color: colors.textTertiary,
    marginTop: spacing.xs,
  },
  chevron: {
    fontSize: typography.size.lg,
    color: colors.textTertiary,
  },
  modal: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalContent: {
    padding: spacing.base,
    paddingBottom: spacing.xxxl,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  modalTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.text,
  },
  modalCancel: {
    fontSize: typography.size.md,
    color: colors.textSecondary,
  },
  modalSave: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.primary,
  },
  disabled: {
    opacity: 0.4,
  },
  fieldLabel: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  fieldLabelInline: {
    fontSize: typography.size.base,
    color: colors.text,
  },
  multiline: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  deleteButton: {
    marginTop: spacing.xl,
  },
});

export default HealthRemindersScreen;
