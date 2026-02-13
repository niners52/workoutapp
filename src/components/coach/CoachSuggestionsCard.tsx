import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Card } from '../common';
import { colors, typography, spacing, borderRadius } from '../../theme';
import { CoachSuggestion } from '../../services/coachSuggestions';

interface Props {
  suggestions: CoachSuggestion[];
  onDismiss: (id: string) => void;
  onMuscleGroupPress?: (muscleGroup: string) => void;
}

export function CoachSuggestionsCard({ suggestions, onDismiss, onMuscleGroupPress }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <MaterialCommunityIcons name="whistle" size={18} color={colors.primary} />
        <Text style={styles.sectionTitle}>Coach</Text>
      </View>
      <Card padding="none">
        {suggestions.map((suggestion, index) => {
          const isExpanded = expandedId === suggestion.id;
          const isFirst = index === 0;
          const isLast = index === suggestions.length - 1;

          return (
            <TouchableOpacity
              key={suggestion.id}
              style={[
                styles.row,
                isFirst && styles.rowFirst,
                isLast && styles.rowLast,
                !isLast && styles.rowBorder,
              ]}
              onPress={() => {
                if (suggestion.detail) {
                  setExpandedId(isExpanded ? null : suggestion.id);
                } else if (suggestion.muscleGroup && onMuscleGroupPress) {
                  onMuscleGroupPress(suggestion.muscleGroup);
                }
              }}
              activeOpacity={0.7}
            >
              <View style={styles.iconContainer}>
                <Ionicons
                  name={suggestion.icon as any}
                  size={20}
                  color={colors.primary}
                />
              </View>
              <View style={styles.textContainer}>
                <Text style={styles.message} numberOfLines={isExpanded ? undefined : 2}>
                  {suggestion.message}
                </Text>
                {isExpanded && suggestion.detail && (
                  <Text style={styles.detail}>{suggestion.detail}</Text>
                )}
              </View>
              <TouchableOpacity
                style={styles.dismissButton}
                onPress={() => onDismiss(suggestion.id)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={16} color={colors.textTertiary} />
              </TouchableOpacity>
            </TouchableOpacity>
          );
        })}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.text,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
  },
  rowFirst: {
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
  },
  rowLast: {
    borderBottomLeftRadius: borderRadius.lg,
    borderBottomRightRadius: borderRadius.lg,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  iconContainer: {
    width: 32,
    alignItems: 'center',
    paddingTop: 2,
  },
  textContainer: {
    flex: 1,
    marginRight: spacing.sm,
  },
  message: {
    fontSize: typography.size.sm,
    color: colors.text,
    lineHeight: typography.size.sm * 1.5,
  },
  detail: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    lineHeight: typography.size.xs * 1.5,
  },
  dismissButton: {
    paddingTop: 2,
    paddingLeft: spacing.sm,
  },
});

export default CoachSuggestionsCard;
