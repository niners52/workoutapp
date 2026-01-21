import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
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
  ALL_TEMPLATE_TYPES,
  TEMPLATE_TYPE_DISPLAY_NAMES,
} from '../types';
import { RootStackParamList } from '../navigation/types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

type Step = 'type' | 'location' | 'template';

export function StartWorkoutScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { templates, locations } = useData();
  const { startWorkout } = useWorkout();

  const [step, setStep] = useState<Step>('type');
  const [selectedType, setSelectedType] = useState<TemplateType | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<WorkoutLocation | null>(null);

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

  const handleSelectTemplate = async (template: Template) => {
    const workoutId = await startWorkout(template.id);
    navigation.navigate('ActiveWorkout', { workoutId });
  };

  const handleStartBlank = async () => {
    const workoutId = await startWorkout();
    navigation.navigate('ActiveWorkout', { workoutId });
  };

  const handleBack = () => {
    if (step === 'location') {
      setStep('type');
      setSelectedType(null);
    } else if (step === 'template') {
      setStep('location');
      setSelectedLocation(null);
    }
  };

  const renderStepIndicator = () => (
    <View style={styles.stepIndicator}>
      <View style={[styles.stepDot, step === 'type' && styles.stepDotActive]} />
      <View style={styles.stepLine} />
      <View style={[styles.stepDot, step === 'location' && styles.stepDotActive]} />
      <View style={styles.stepLine} />
      <View style={[styles.stepDot, step === 'template' && styles.stepDotActive]} />
    </View>
  );

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
    </View>
  );

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
