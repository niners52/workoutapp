import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, FlatList, SafeAreaView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../common';
import { colors, typography, spacing, borderRadius } from '../../theme';
import { DAY_NAMES, type RoutineRotation, type RotationSlot, type Template } from '../../types';

interface RotationEditorProps {
  rotation: RoutineRotation;
  templates: Template[];
  onChange: (rotation: RoutineRotation) => void;
}

/** Labels follow position: whatever is first is W1. Slot ids stay put. */
function relabel(slots: RotationSlot[]): RotationSlot[] {
  return slots.map((s, i) => ({ ...s, label: `W${i + 1}` }));
}

function nextSlotId(slots: RotationSlot[]): string {
  const used = new Set(slots.map(s => s.id));
  for (let n = slots.length + 1; ; n++) if (!used.has(`w${n}`)) return `w${n}`;
}

/**
 * The rotation: workouts done in order, on whatever days the week allows,
 * plus the Flex day's default template. Reorder, add and remove workouts
 * here; the weekday each one usually lands on is kept only as a label.
 */
export function RotationEditor({ rotation, templates, onChange }: RotationEditorProps) {
  const [picking, setPicking] = useState<'slot' | 'flex' | null>(null);
  const byId = new Map(templates.map(t => [t.id, t]));
  const slots = rotation.slots;

  const move = (index: number, by: -1 | 1) => {
    const to = index + by;
    if (to < 0 || to >= slots.length) return;
    const next = [...slots];
    const [item] = next.splice(index, 1);
    if (item) next.splice(to, 0, item);
    onChange({ ...rotation, slots: relabel(next) });
  };
  const remove = (index: number) => onChange({ ...rotation, slots: relabel(slots.filter((_, i) => i !== index)) });
  const pick = (template: Template) => {
    if (picking === 'flex') onChange({ ...rotation, flexTemplateId: template.id });
    else onChange({ ...rotation, slots: relabel([...slots, { id: nextSlotId(slots), label: '', templateId: template.id, usualDay: null }]) });
    setPicking(null);
  };

  const flex = rotation.flexTemplateId ? byId.get(rotation.flexTemplateId) : undefined;

  return (
    <Card padding="none">
      {slots.map((slot, i) => (
        <View key={slot.id} style={[styles.row, i > 0 && styles.rowBorder]} testID={`rotation-slot-${slot.id}`}>
          <Text style={styles.label}>{slot.label}</Text>
          <View style={styles.info}>
            <Text style={styles.name} numberOfLines={1}>
              {byId.get(slot.templateId)?.name ?? 'Missing template'}
            </Text>
            {slot.usualDay != null && <Text style={styles.detail}>Usually {DAY_NAMES[slot.usualDay]}</Text>}
          </View>
          <TouchableOpacity onPress={() => move(i, -1)} disabled={i === 0} hitSlop={8} accessibilityLabel={`Move ${slot.label} earlier`}>
            <Ionicons name="chevron-up" size={20} color={i === 0 ? colors.textTertiary : colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => move(i, 1)} disabled={i === slots.length - 1} hitSlop={8} accessibilityLabel={`Move ${slot.label} later`}>
            <Ionicons name="chevron-down" size={20} color={i === slots.length - 1 ? colors.textTertiary : colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => remove(i)} hitSlop={8} accessibilityLabel={`Remove ${slot.label}`}>
            <Ionicons name="close" size={20} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>
      ))}

      <TouchableOpacity style={[styles.row, styles.rowBorder]} onPress={() => setPicking('slot')} activeOpacity={0.7}>
        <Ionicons name="add" size={20} color={colors.primary} />
        <Text style={styles.action}>Add a workout to the rotation</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.row, styles.rowBorder]} onPress={() => setPicking('flex')} activeOpacity={0.7}>
        <Text style={styles.label}>Flex</Text>
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>
            {flex?.name ?? 'No default template'}
          </Text>
          <Text style={styles.detail}>Default exercises for the Flex day · tap to change</Text>
        </View>
      </TouchableOpacity>

      <Modal visible={picking !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPicking(null)}>
        <SafeAreaView style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{picking === 'flex' ? 'Flex default template' : 'Add to rotation'}</Text>
            <TouchableOpacity onPress={() => setPicking(null)}>
              <Text style={styles.sheetDone}>Cancel</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={[...templates].sort((a, b) => a.name.localeCompare(b.name))}
            keyExtractor={t => t.id}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.pickRow} onPress={() => pick(item)}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.detail}>{item.exerciseIds.length} exercises</Text>
              </TouchableOpacity>
            )}
          />
        </SafeAreaView>
      </Modal>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  rowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },
  label: {
    width: 36,
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: colors.primary,
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: typography.size.md,
    color: colors.text,
  },
  detail: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  action: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: colors.primary,
  },
  sheet: {
    flex: 1,
    backgroundColor: colors.background,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.base,
  },
  sheetTitle: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.text,
  },
  sheetDone: {
    fontSize: typography.size.md,
    color: colors.primary,
    fontWeight: typography.weight.semibold,
  },
  pickRow: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
    borderRadius: borderRadius.sm,
  },
});
