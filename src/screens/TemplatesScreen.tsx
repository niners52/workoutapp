import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, borderRadius, commonStyles } from '../theme';
import { Card } from '../components/common';
import { useData } from '../contexts/DataContext';
import { Template } from '../types';
import { RootStackParamList } from '../navigation/types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface TemplateSection {
  title: string;
  data: Template[];
}

export function TemplatesScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { templates, exercises, deleteTemplate, locations } = useData();

  // Group templates by location
  const templatesByLocation = locations.map(location => ({
    title: location.name,
    data: templates.filter(t => t.locationId === location.id),
  })).filter(s => s.data.length > 0);

  const handleTemplatePress = (template: Template) => {
    navigation.navigate('TemplateDetail', { templateId: template.id });
  };

  const handleCreateTemplate = () => {
    navigation.navigate('CreateTemplate');
  };

  const handleDeleteTemplate = (template: Template) => {
    Alert.alert(
      'Delete Template',
      `Are you sure you want to delete "${template.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteTemplate(template.id),
        },
      ]
    );
  };

  const renderTemplate = ({ item: template }: { item: Template }) => {
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
        style={styles.templateItem}
        onPress={() => handleTemplatePress(template)}
        onLongPress={() => handleDeleteTemplate(template)}
        activeOpacity={0.7}
      >
        <View style={styles.templateContent}>
          <Text style={styles.templateName}>{template.name}</Text>
          <Text style={styles.templateSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
        <View style={styles.templateRight}>
          <Text style={styles.exerciseCount}>
            {template.exerciseIds.length}
          </Text>
          <Text style={styles.chevron}>›</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderSectionHeader = ({ section }: { section: TemplateSection }) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{section.title}</Text>
    </View>
  );

  return (
    <SafeAreaView style={commonStyles.safeArea} edges={['top']}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Templates</Text>
          <TouchableOpacity onPress={handleCreateTemplate}>
            <Text style={styles.addText}>+ New</Text>
          </TouchableOpacity>
        </View>

        {templatesByLocation.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No templates yet</Text>
            <Text style={styles.emptySubtext}>
              Create a template to quickly start workouts
            </Text>
          </View>
        ) : (
          <SectionList
            sections={templatesByLocation}
            keyExtractor={item => item.id}
            renderItem={renderTemplate}
            renderSectionHeader={renderSectionHeader}
            contentContainerStyle={styles.listContent}
            stickySectionHeadersEnabled
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.base,
  },
  title: {
    fontSize: typography.size.xxxl,
    fontWeight: typography.weight.bold,
    color: colors.text,
  },
  addText: {
    fontSize: typography.size.md,
    color: colors.primary,
    fontWeight: typography.weight.medium,
  },
  listContent: {
    paddingBottom: spacing.xl,
  },
  sectionHeader: {
    backgroundColor: colors.background,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  sectionTitle: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  templateItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundSecondary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  templateContent: {
    flex: 1,
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
  templateRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  exerciseCount: {
    fontSize: typography.size.sm,
    color: colors.textTertiary,
    marginRight: spacing.sm,
  },
  chevron: {
    fontSize: typography.size.xl,
    color: colors.textTertiary,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  emptyText: {
    fontSize: typography.size.lg,
    color: colors.textSecondary,
  },
  emptySubtext: {
    fontSize: typography.size.base,
    color: colors.textTertiary,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
});

export default TemplatesScreen;
