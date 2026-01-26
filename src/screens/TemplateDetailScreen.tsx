import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, borderRadius, commonStyles } from '../theme';
import { Button, Card } from '../components/common';
import { useData } from '../contexts/DataContext';
import { useWorkout } from '../contexts/WorkoutContext';
import { MUSCLE_GROUP_DISPLAY_NAMES, EQUIPMENT_DISPLAY_NAMES, CABLE_ACCESSORY_DISPLAY_NAMES, Equipment } from '../types';
import { RootStackParamList } from '../navigation/types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type TemplateDetailRouteProp = RouteProp<RootStackParamList, 'TemplateDetail'>;

export function TemplateDetailScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<TemplateDetailRouteProp>();
  const { templateId } = route.params;
  const { templates, exercises, deleteTemplate, getLocationById } = useData();
  const { startWorkout } = useWorkout();

  const template = templates.find(t => t.id === templateId);

  if (!template) {
    return (
      <SafeAreaView style={commonStyles.safeArea}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Template not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const templateExercises = template.exerciseIds
    .map(id => exercises.find(e => e.id === id))
    .filter(Boolean);

  const location = getLocationById(template.locationId);

  // Get unique equipment used in this template
  const uniqueEquipment = useMemo(() => {
    const equipmentSet = new Set<Equipment>();
    templateExercises.forEach(exercise => {
      if (exercise?.equipment) {
        equipmentSet.add(exercise.equipment);
      }
    });
    return Array.from(equipmentSet);
  }, [templateExercises]);

  const handleStartWorkout = async () => {
    const workoutId = await startWorkout(template.id);
    navigation.navigate('ActiveWorkout', { workoutId });
  };

  const handleEdit = () => {
    navigation.navigate('EditTemplate', { templateId });
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Template',
      `Are you sure you want to delete "${template.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteTemplate(templateId);
            navigation.goBack();
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={commonStyles.safeArea} edges={['top']}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>{template.name}</Text>
          <Text style={styles.subtitle}>
            {location?.name || 'Unknown'} • {templateExercises.length} exercises
          </Text>
          {uniqueEquipment.length > 0 && (
            <View style={styles.equipmentRow}>
              {uniqueEquipment.map(eq => (
                <View key={eq} style={styles.equipmentChip}>
                  <Text style={styles.equipmentChipText}>
                    {EQUIPMENT_DISPLAY_NAMES[eq]}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Start Workout Button */}
        <Button
          title="Start Workout"
          onPress={handleStartWorkout}
          fullWidth
          size="large"
        />

        {/* Exercises */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Exercises</Text>
          <Card padding="none">
            {templateExercises.map((exercise, index) => (
              <TouchableOpacity
                key={exercise!.id}
                style={[
                  styles.exerciseItem,
                  index === 0 && styles.exerciseItemFirst,
                  index === templateExercises.length - 1 && styles.exerciseItemLast,
                  index < templateExercises.length - 1 && styles.exerciseItemBorder,
                ]}
                onPress={() => navigation.navigate('ExerciseDetail', { exerciseId: exercise!.id })}
                activeOpacity={0.7}
              >
                <View style={styles.exerciseNumber}>
                  <Text style={styles.numberText}>{index + 1}</Text>
                </View>
                <View style={styles.exerciseInfo}>
                  <Text style={styles.exerciseName}>{exercise!.name}</Text>
                  <Text style={styles.exerciseMuscle}>
                    {exercise!.primaryMuscleGroups && exercise!.primaryMuscleGroups.length > 0
                      ? exercise!.primaryMuscleGroups.map(m => MUSCLE_GROUP_DISPLAY_NAMES[m]).join(', ')
                      : exercise!.primaryMuscleGroup
                      ? MUSCLE_GROUP_DISPLAY_NAMES[exercise!.primaryMuscleGroup]
                      : 'Unknown'}
                    {' • '}
                    {EQUIPMENT_DISPLAY_NAMES[exercise!.equipment]}
                    {exercise!.equipment === 'cable' && exercise!.cableAccessory &&
                      ` (${CABLE_ACCESSORY_DISPLAY_NAMES[exercise!.cableAccessory]})`}
                  </Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </TouchableOpacity>
            ))}
          </Card>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <Button
            title="Edit Template"
            onPress={handleEdit}
            variant="secondary"
            fullWidth
          />
          <Button
            title="Delete Template"
            onPress={handleDelete}
            variant="destructive"
            fullWidth
            style={styles.deleteButton}
          />
        </View>
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
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: typography.size.lg,
    color: colors.textSecondary,
  },
  header: {
    marginBottom: spacing.lg,
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
    textTransform: 'capitalize',
  },
  equipmentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  equipmentChip: {
    backgroundColor: colors.backgroundTertiary,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  equipmentChipText: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },
  section: {
    marginTop: spacing.xl,
  },
  sectionTitle: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.md,
  },
  exerciseItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
  },
  exerciseItemFirst: {
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
  },
  exerciseItemLast: {
    borderBottomLeftRadius: borderRadius.lg,
    borderBottomRightRadius: borderRadius.lg,
  },
  exerciseItemBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  exerciseNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.backgroundTertiary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  numberText: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.textSecondary,
  },
  exerciseInfo: {
    flex: 1,
  },
  exerciseName: {
    fontSize: typography.size.md,
    color: colors.text,
  },
  exerciseMuscle: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  chevron: {
    fontSize: typography.size.xl,
    color: colors.textTertiary,
    marginLeft: spacing.sm,
  },
  actions: {
    marginTop: spacing.xl,
  },
  deleteButton: {
    marginTop: spacing.md,
  },
});

export default TemplateDetailScreen;
