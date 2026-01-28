import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, borderRadius, commonStyles } from '../theme';
import { Button, Card } from '../components/common';
import { useData } from '../contexts/DataContext';
import { useWorkout } from '../contexts/WorkoutContext';
import {
  Template,
  TemplateType,
  WorkoutLocation,
  Exercise,
  PrimaryMuscleGroup,
  ALL_TEMPLATE_TYPES,
  TEMPLATE_TYPE_DISPLAY_NAMES,
  MUSCLE_GROUP_DISPLAY_NAMES,
} from '../types';
import { getWeeklyVolume } from '../services/analytics';
import { RootStackParamList } from '../navigation/types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

type Step = 'type' | 'location' | 'template' | 'shortfalls' | 'remaining-location' | 'remaining-exercises';

interface MuscleShortfall {
  muscleGroup: PrimaryMuscleGroup;
  current: number;
  target: number;
  shortfall: number;
}

interface SuggestedExercise {
  exercise: Exercise;
  targetMuscles: PrimaryMuscleGroup[];
  suggestedSets: number;
  selected: boolean;
}

export function StartWorkoutScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { templates, locations, exercises } = useData();
  const { startWorkout, addExerciseToWorkout } = useWorkout();

  const [step, setStep] = useState<Step>('type');
  const [selectedType, setSelectedType] = useState<TemplateType | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<WorkoutLocation | null>(null);

  // Remaining Weekly Work state
  const [shortfalls, setShortfalls] = useState<MuscleShortfall[]>([]);
  const [suggestedExercises, setSuggestedExercises] = useState<SuggestedExercise[]>([]);
  const [loadingShortfalls, setLoadingShortfalls] = useState(false);

  // Filter templates based on selections
  const filteredTemplates = useMemo(() => {
    if (!selectedType || !selectedLocation) return [];
    return templates.filter(
      t => t.type === selectedType && t.locationId === selectedLocation.id
    );
  }, [templates, selectedType, selectedLocation]);

  // Get locations that have templates for the selected type
  const availableLocations = useMemo(() => {
    if (!selectedType) return locations;
    const locationIdsWithTemplates = new Set(
      templates
        .filter(t => t.type === selectedType)
        .map(t => t.locationId)
    );
    return locations.filter(l => locationIdsWithTemplates.has(l.id));
  }, [locations, templates, selectedType]);

  const handleTypeSelect = (type: TemplateType) => {
    setSelectedType(type);
    setStep('location');
  };

  const handleLocationSelect = (location: WorkoutLocation) => {
    setSelectedLocation(location);
    setStep('template');
  };

  const handleSelectTemplate = (template: Template) => {
    startWorkout(template.id)
      .then((workoutId) => {
        navigation.navigate('ActiveWorkout', { workoutId });
      })
      .catch((error) => {
        console.error('Failed to start workout:', error);
      });
  };

  const handleStartBlank = () => {
    startWorkout()
      .then((workoutId) => {
        navigation.navigate('ActiveWorkout', { workoutId });
      })
      .catch((error) => {
        console.error('Failed to start workout:', error);
      });
  };

  // Remaining Weekly Work handlers
  const handleRemainingWorkSelect = async () => {
    setLoadingShortfalls(true);
    try {
      const weeklyVolume = await getWeeklyVolume(new Date());

      // Calculate shortfalls (muscle groups under target)
      const muscleShortfalls: MuscleShortfall[] = weeklyVolume.muscleGroups
        .filter(mg => mg.target > 0 && mg.sets < mg.target)
        .map(mg => ({
          muscleGroup: mg.muscleGroup,
          current: mg.sets,
          target: mg.target,
          shortfall: mg.target - mg.sets,
        }))
        .sort((a, b) => {
          // Sort by percentage completion (least complete first)
          const aPercent = a.current / a.target;
          const bPercent = b.current / b.target;
          return aPercent - bPercent;
        });

      setShortfalls(muscleShortfalls);
      setStep('shortfalls');
    } catch (error) {
      console.error('Failed to calculate shortfalls:', error);
    } finally {
      setLoadingShortfalls(false);
    }
  };

  const handleShortfallsContinue = () => {
    setStep('remaining-location');
  };

  const handleRemainingLocationSelect = (location: WorkoutLocation) => {
    setSelectedLocation(location);

    // Calculate suggested exercises based on shortfalls and location
    const shortfallMuscles = new Set(shortfalls.map(s => s.muscleGroup));

    // Build a map of muscle group to shortfall amount
    const shortfallMap = new Map<PrimaryMuscleGroup, number>();
    shortfalls.forEach(s => shortfallMap.set(s.muscleGroup, s.shortfall));

    // Find exercises at this location that target shortfall muscles
    const matchingExercises: SuggestedExercise[] = [];

    exercises.forEach(exercise => {
      // Check if exercise is available at location
      if (!exercise.locationIds?.includes(location.id)) return;

      // Get primary muscle groups
      const primaryMuscles = exercise.primaryMuscleGroups && exercise.primaryMuscleGroups.length > 0
        ? exercise.primaryMuscleGroups
        : exercise.primaryMuscleGroup
        ? [exercise.primaryMuscleGroup]
        : [];

      // Get secondary muscle groups
      const secondaryMuscles = exercise.secondaryMuscleGroups || [];

      // Check if exercise targets any shortfall muscles
      const targetedPrimary = primaryMuscles.filter(m => shortfallMuscles.has(m));
      const targetedSecondary = secondaryMuscles.filter(m => shortfallMuscles.has(m));

      if (targetedPrimary.length > 0 || targetedSecondary.length > 0) {
        // Calculate suggested sets based on max shortfall among targeted muscles
        const allTargeted = [...targetedPrimary, ...targetedSecondary];
        const maxShortfall = Math.max(...allTargeted.map(m => shortfallMap.get(m) || 0));
        const suggestedSets = Math.min(Math.ceil(maxShortfall / 2), 4); // Cap at 4 sets

        matchingExercises.push({
          exercise,
          targetMuscles: [...targetedPrimary, ...targetedSecondary],
          suggestedSets,
          selected: targetedPrimary.length > 0, // Pre-select if targets primary
        });
      }
    });

    // Sort by: primary match count desc, then by max shortfall desc
    matchingExercises.sort((a, b) => {
      const aPrimaryCount = a.exercise.primaryMuscleGroups?.filter(m => shortfallMuscles.has(m)).length || 0;
      const bPrimaryCount = b.exercise.primaryMuscleGroups?.filter(m => shortfallMuscles.has(m)).length || 0;

      if (bPrimaryCount !== aPrimaryCount) {
        return bPrimaryCount - aPrimaryCount;
      }

      // Then by max shortfall
      const aMaxShortfall = Math.max(...a.targetMuscles.map(m => shortfallMap.get(m) || 0));
      const bMaxShortfall = Math.max(...b.targetMuscles.map(m => shortfallMap.get(m) || 0));
      return bMaxShortfall - aMaxShortfall;
    });

    setSuggestedExercises(matchingExercises);
    setStep('remaining-exercises');
  };

  const toggleExerciseSelection = (exerciseId: string) => {
    setSuggestedExercises(prev => prev.map(item =>
      item.exercise.id === exerciseId
        ? { ...item, selected: !item.selected }
        : item
    ));
  };

  const handleStartRemainingWorkout = async () => {
    const selectedExerciseIds = suggestedExercises
      .filter(item => item.selected)
      .map(item => item.exercise.id);

    if (selectedExerciseIds.length === 0) {
      // Start blank if nothing selected
      handleStartBlank();
      return;
    }

    try {
      // Start a blank workout
      const workoutId = await startWorkout();

      // Add each selected exercise
      for (const exerciseId of selectedExerciseIds) {
        await addExerciseToWorkout(exerciseId);
      }

      navigation.navigate('ActiveWorkout', { workoutId });
    } catch (error) {
      console.error('Failed to start workout:', error);
    }
  };

  const handleBack = () => {
    if (step === 'location') {
      setStep('type');
      setSelectedType(null);
    } else if (step === 'template') {
      setStep('location');
      setSelectedLocation(null);
    } else if (step === 'shortfalls') {
      setStep('type');
      setShortfalls([]);
    } else if (step === 'remaining-location') {
      setStep('shortfalls');
    } else if (step === 'remaining-exercises') {
      setStep('remaining-location');
      setSelectedLocation(null);
      setSuggestedExercises([]);
    }
  };

  const renderStepIndicator = () => {
    // Determine which steps to show based on current flow
    const isRemainingFlow = ['shortfalls', 'remaining-location', 'remaining-exercises'].includes(step);

    if (isRemainingFlow) {
      return (
        <View style={styles.stepIndicator}>
          <View style={[styles.stepDot, step === 'shortfalls' && styles.stepDotActive]} />
          <View style={styles.stepLine} />
          <View style={[styles.stepDot, step === 'remaining-location' && styles.stepDotActive]} />
          <View style={styles.stepLine} />
          <View style={[styles.stepDot, step === 'remaining-exercises' && styles.stepDotActive]} />
        </View>
      );
    }

    return (
      <View style={styles.stepIndicator}>
        <View style={[styles.stepDot, step === 'type' && styles.stepDotActive]} />
        <View style={styles.stepLine} />
        <View style={[styles.stepDot, step === 'location' && styles.stepDotActive]} />
        <View style={styles.stepLine} />
        <View style={[styles.stepDot, step === 'template' && styles.stepDotActive]} />
      </View>
    );
  };

  const renderTypeStep = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Select Workout Type</Text>
      <View style={styles.typeGrid}>
        {ALL_TEMPLATE_TYPES.map(type => (
          <TouchableOpacity
            key={type}
            style={styles.typeCard}
            onPress={() => handleTypeSelect(type)}
            activeOpacity={0.7}
          >
            <Text style={styles.typeIcon}>
              {type === 'push' ? '💪' : type === 'pull' ? '🏋️' : '🦵'}
            </Text>
            <Text style={styles.typeName}>{TEMPLATE_TYPE_DISPLAY_NAMES[type]}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Remaining Weekly Work Option */}
      <TouchableOpacity
        style={styles.remainingWorkCard}
        onPress={handleRemainingWorkSelect}
        activeOpacity={0.7}
        disabled={loadingShortfalls}
      >
        {loadingShortfalls ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <>
            <Text style={styles.remainingWorkIcon}>📊</Text>
            <View style={styles.remainingWorkContent}>
              <Text style={styles.remainingWorkTitle}>Remaining Weekly Work</Text>
              <Text style={styles.remainingWorkSubtitle}>
                Target muscle groups you haven't hit yet
              </Text>
            </View>
            <Text style={styles.remainingWorkArrow}>›</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );

  const renderShortfallsStep = () => (
    <View style={styles.stepContent}>
      <View style={styles.stepHeader}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.selectedBadge}>Weekly Shortfalls</Text>
      </View>
      <Text style={styles.stepTitle}>Muscle Groups to Target</Text>

      {shortfalls.length === 0 ? (
        <Card style={styles.caughtUpCard}>
          <Text style={styles.caughtUpIcon}>🎉</Text>
          <Text style={styles.caughtUpTitle}>You're all caught up!</Text>
          <Text style={styles.caughtUpText}>
            All your muscle group targets have been met this week.
          </Text>
          <Button
            title="Start Regular Workout"
            onPress={() => setStep('type')}
            style={styles.caughtUpButton}
          />
        </Card>
      ) : (
        <>
          <Card padding="none">
            {shortfalls.map((shortfall, index) => {
              const percentage = Math.round((shortfall.current / shortfall.target) * 100);
              return (
                <View
                  key={shortfall.muscleGroup}
                  style={[
                    styles.shortfallItem,
                    index === 0 && styles.shortfallItemFirst,
                    index === shortfalls.length - 1 && styles.shortfallItemLast,
                    index < shortfalls.length - 1 && styles.shortfallItemBorder,
                  ]}
                >
                  <View style={styles.shortfallInfo}>
                    <Text style={styles.shortfallName}>
                      {MUSCLE_GROUP_DISPLAY_NAMES[shortfall.muscleGroup]}
                    </Text>
                    <Text style={styles.shortfallSets}>
                      {shortfall.current}/{shortfall.target} sets
                    </Text>
                  </View>
                  <View style={styles.shortfallProgress}>
                    <View style={styles.shortfallProgressTrack}>
                      <View
                        style={[
                          styles.shortfallProgressFill,
                          { width: `${Math.min(percentage, 100)}%` }
                        ]}
                      />
                    </View>
                    <Text style={styles.shortfallNeed}>
                      Need {shortfall.shortfall} more
                    </Text>
                  </View>
                </View>
              );
            })}
          </Card>

          <Button
            title="Select Location"
            onPress={handleShortfallsContinue}
            fullWidth
            style={styles.continueButton}
          />
        </>
      )}
    </View>
  );

  const renderRemainingLocationStep = () => (
    <View style={styles.stepContent}>
      <View style={styles.stepHeader}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.selectedBadge}>
          {shortfalls.length} muscles to target
        </Text>
      </View>
      <Text style={styles.stepTitle}>Where are you working out?</Text>
      <View style={styles.locationGrid}>
        {locations.map(location => (
          <TouchableOpacity
            key={location.id}
            style={styles.locationCard}
            onPress={() => handleRemainingLocationSelect(location)}
            activeOpacity={0.7}
          >
            <Text style={styles.locationIcon}>📍</Text>
            <Text style={styles.locationName}>{location.name}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderRemainingExercisesStep = () => {
    const selectedCount = suggestedExercises.filter(e => e.selected).length;

    return (
      <View style={styles.stepContent}>
        <View style={styles.stepHeader}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton}>
            <Text style={styles.backButtonText}>‹ Back</Text>
          </TouchableOpacity>
          <View style={styles.selectedBadges}>
            <Text style={styles.selectedBadge}>{selectedLocation?.name}</Text>
          </View>
        </View>
        <Text style={styles.stepTitle}>Suggested Exercises</Text>
        <Text style={styles.stepSubtitle}>
          Tap to select/deselect exercises for your workout
        </Text>

        {suggestedExercises.length === 0 ? (
          <Card>
            <Text style={styles.emptyText}>
              No exercises found at {selectedLocation?.name} that target your shortfall muscles.
              {'\n\n'}Try a different location or start a blank workout.
            </Text>
          </Card>
        ) : (
          <>
            <Card padding="none">
              {suggestedExercises.map((item, index) => (
                <TouchableOpacity
                  key={item.exercise.id}
                  style={[
                    styles.exerciseItem,
                    index === 0 && styles.exerciseItemFirst,
                    index === suggestedExercises.length - 1 && styles.exerciseItemLast,
                    index < suggestedExercises.length - 1 && styles.exerciseItemBorder,
                    item.selected && styles.exerciseItemSelected,
                  ]}
                  onPress={() => toggleExerciseSelection(item.exercise.id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.exerciseCheckbox}>
                    {item.selected && <Text style={styles.exerciseCheckmark}>✓</Text>}
                  </View>
                  <View style={styles.exerciseInfo}>
                    <Text style={styles.exerciseName}>{item.exercise.name}</Text>
                    <View style={styles.exerciseTags}>
                      {item.targetMuscles.map(muscle => (
                        <View key={muscle} style={styles.muscleTag}>
                          <Text style={styles.muscleTagText}>
                            {MUSCLE_GROUP_DISPLAY_NAMES[muscle]}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                  <Text style={styles.suggestedSets}>
                    {item.suggestedSets} sets
                  </Text>
                </TouchableOpacity>
              ))}
            </Card>

            <View style={styles.exerciseActions}>
              <TouchableOpacity
                style={styles.addMoreButton}
                onPress={() => {
                  // Start the workout first, then navigate to exercise picker
                  handleStartRemainingWorkout();
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.addMoreText}>+ Add from library</Text>
              </TouchableOpacity>
            </View>

            <Button
              title={`Start Workout (${selectedCount} exercises)`}
              onPress={handleStartRemainingWorkout}
              fullWidth
              disabled={selectedCount === 0}
              style={styles.startButton}
            />
          </>
        )}
      </View>
    );
  };

  const renderLocationStep = () => (
    <View style={styles.stepContent}>
      <View style={styles.stepHeader}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.selectedBadge}>
          {selectedType ? TEMPLATE_TYPE_DISPLAY_NAMES[selectedType] : ''}
        </Text>
      </View>
      <Text style={styles.stepTitle}>Select Location</Text>
      {availableLocations.length === 0 ? (
        <Card>
          <Text style={styles.emptyText}>
            No locations with {selectedType} templates.{'\n'}
            Create a template first in Templates tab.
          </Text>
        </Card>
      ) : (
        <View style={styles.locationGrid}>
          {availableLocations.map(location => (
            <TouchableOpacity
              key={location.id}
              style={styles.locationCard}
              onPress={() => handleLocationSelect(location)}
              activeOpacity={0.7}
            >
              <Text style={styles.locationIcon}>📍</Text>
              <Text style={styles.locationName}>{location.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );

  const renderTemplateStep = () => (
    <View style={styles.stepContent}>
      <View style={styles.stepHeader}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>‹ Back</Text>
        </TouchableOpacity>
        <View style={styles.selectedBadges}>
          <Text style={styles.selectedBadge}>
            {selectedType ? TEMPLATE_TYPE_DISPLAY_NAMES[selectedType] : ''}
          </Text>
          <Text style={styles.selectedBadge}>
            {selectedLocation?.name || ''}
          </Text>
        </View>
      </View>
      <Text style={styles.stepTitle}>Select Template</Text>
      {filteredTemplates.length === 0 ? (
        <Card>
          <Text style={styles.emptyText}>
            No templates found for this combination.{'\n'}
            Create one in the Templates tab.
          </Text>
        </Card>
      ) : (
        <Card padding="none">
          {filteredTemplates.map((template, index) => (
            <TemplateItem
              key={template.id}
              template={template}
              onPress={() => handleSelectTemplate(template)}
              isFirst={index === 0}
              isLast={index === filteredTemplates.length - 1}
            />
          ))}
        </Card>
      )}
    </View>
  );

  return (
    <SafeAreaView style={commonStyles.safeArea} edges={['top']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
      >
        <Text style={styles.title}>Start Workout</Text>

        {renderStepIndicator()}

        {/* Start Options */}
        <View style={styles.section}>
          <Button
            title="Start Blank Workout"
            onPress={handleStartBlank}
            variant="secondary"
            fullWidth
          />
          <TouchableOpacity
            style={styles.pastWorkoutButton}
            onPress={() => navigation.navigate('LogPastWorkout')}
            activeOpacity={0.7}
          >
            <Text style={styles.pastWorkoutIcon}>📅</Text>
            <Text style={styles.pastWorkoutText}>Log Past Workout</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or choose template</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Step Content */}
        {step === 'type' && renderTypeStep()}
        {step === 'location' && renderLocationStep()}
        {step === 'template' && renderTemplateStep()}
        {step === 'shortfalls' && renderShortfallsStep()}
        {step === 'remaining-location' && renderRemainingLocationStep()}
        {step === 'remaining-exercises' && renderRemainingExercisesStep()}
      </ScrollView>
    </SafeAreaView>
  );
}

interface TemplateItemProps {
  template: Template;
  onPress: () => void;
  isFirst: boolean;
  isLast: boolean;
}

function TemplateItem({ template, onPress, isFirst, isLast }: TemplateItemProps) {
  const { exercises } = useData();

  const exerciseNames = template.exerciseIds
    .slice(0, 3)
    .map(id => {
      const exercise = exercises.find(e => e.id === id);
      return exercise?.name || 'Unknown';
    })
    .join(', ');

  const moreCount = template.exerciseIds.length - 3;
  const subtitle = moreCount > 0
    ? `${exerciseNames}, +${moreCount} more`
    : exerciseNames;

  return (
    <TouchableOpacity
      style={[
        styles.templateItem,
        isFirst && styles.templateItemFirst,
        isLast && styles.templateItemLast,
        !isLast && styles.templateItemBorder,
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.templateContent}>
        <Text style={styles.templateName}>{template.name}</Text>
        <Text style={styles.templateSubtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <Text style={styles.exerciseCount}>
        {template.exerciseIds.length} exercises
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.base,
  },
  title: {
    fontSize: typography.size.xxxl,
    fontWeight: typography.weight.bold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  stepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  stepDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.backgroundTertiary,
  },
  stepDotActive: {
    backgroundColor: colors.primary,
  },
  stepLine: {
    width: 40,
    height: 2,
    backgroundColor: colors.backgroundTertiary,
    marginHorizontal: spacing.xs,
  },
  section: {
    marginBottom: spacing.md,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.lg,
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
  stepContent: {
    marginBottom: spacing.xl,
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  backButton: {
    paddingVertical: spacing.xs,
    paddingRight: spacing.md,
  },
  backButtonText: {
    fontSize: typography.size.md,
    color: colors.primary,
  },
  selectedBadges: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  selectedBadge: {
    fontSize: typography.size.sm,
    color: colors.primary,
    backgroundColor: colors.primaryDim,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    overflow: 'hidden',
  },
  stepTitle: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  stepSubtitle: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    marginTop: -spacing.sm,
  },
  typeGrid: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  typeCard: {
    flex: 1,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    alignItems: 'center',
  },
  typeIcon: {
    fontSize: 32,
    marginBottom: spacing.sm,
  },
  typeName: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.medium,
    color: colors.text,
  },
  // Remaining Weekly Work card
  remainingWorkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryDim,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    marginTop: spacing.lg,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  remainingWorkIcon: {
    fontSize: 28,
    marginRight: spacing.md,
  },
  remainingWorkContent: {
    flex: 1,
  },
  remainingWorkTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.primary,
  },
  remainingWorkSubtitle: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  remainingWorkArrow: {
    fontSize: typography.size.xl,
    color: colors.primary,
  },
  // Caught up state
  caughtUpCard: {
    alignItems: 'center',
    padding: spacing.xl,
  },
  caughtUpIcon: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  caughtUpTitle: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  caughtUpText: {
    fontSize: typography.size.base,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  caughtUpButton: {
    marginTop: spacing.sm,
  },
  // Shortfall items
  shortfallItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
  },
  shortfallItemFirst: {
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
  },
  shortfallItemLast: {
    borderBottomLeftRadius: borderRadius.lg,
    borderBottomRightRadius: borderRadius.lg,
  },
  shortfallItemBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  shortfallInfo: {
    flex: 1,
  },
  shortfallName: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.medium,
    color: colors.text,
  },
  shortfallSets: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  shortfallProgress: {
    alignItems: 'flex-end',
    width: 100,
  },
  shortfallProgressTrack: {
    width: '100%',
    height: 6,
    backgroundColor: colors.backgroundTertiary,
    borderRadius: 3,
    overflow: 'hidden',
  },
  shortfallProgressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 3,
  },
  shortfallNeed: {
    fontSize: typography.size.xs,
    color: colors.warning,
    marginTop: spacing.xs,
  },
  continueButton: {
    marginTop: spacing.lg,
  },
  // Exercise selection
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
  exerciseItemSelected: {
    backgroundColor: colors.primaryDim,
  },
  exerciseCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.primary,
    marginRight: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exerciseCheckmark: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: typography.weight.bold,
  },
  exerciseInfo: {
    flex: 1,
  },
  exerciseName: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.medium,
    color: colors.text,
  },
  exerciseTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  muscleTag: {
    backgroundColor: colors.backgroundTertiary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  muscleTagText: {
    fontSize: typography.size.xs,
    color: colors.primary,
  },
  suggestedSets: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginLeft: spacing.sm,
  },
  exerciseActions: {
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  addMoreButton: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  addMoreText: {
    fontSize: typography.size.md,
    color: colors.primary,
  },
  startButton: {
    marginTop: spacing.md,
  },
  locationGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  locationCard: {
    width: '47%',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    alignItems: 'center',
  },
  locationIcon: {
    fontSize: 28,
    marginBottom: spacing.sm,
  },
  locationName: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.medium,
    color: colors.text,
  },
  emptyText: {
    fontSize: typography.size.base,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  templateItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
  },
  templateItemFirst: {
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
  },
  templateItemLast: {
    borderBottomLeftRadius: borderRadius.lg,
    borderBottomRightRadius: borderRadius.lg,
  },
  templateItemBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  templateContent: {
    flex: 1,
    marginRight: spacing.md,
  },
  templateName: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.medium,
    color: colors.text,
  },
  templateSubtitle: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  exerciseCount: {
    fontSize: typography.size.sm,
    color: colors.textTertiary,
  },
  pastWorkoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  pastWorkoutIcon: {
    fontSize: 18,
    marginRight: spacing.sm,
  },
  pastWorkoutText: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.medium,
    color: colors.text,
  },
});

export default StartWorkoutScreen;
