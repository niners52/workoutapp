import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, borderRadius, commonStyles } from '../theme';
import { CalendarScreen } from './CalendarScreen';
import { AnalyticsScreen } from './AnalyticsScreen';
import { ProgressPhotosScreen } from './ProgressPhotosScreen';

type ProgressTab = 'calendar' | 'analytics' | 'photos';

const TABS: { key: ProgressTab; label: string }[] = [
  { key: 'calendar', label: 'Calendar' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'photos', label: 'Photos' },
];

export function ProgressScreen() {
  const [activeTab, setActiveTab] = useState<ProgressTab>('calendar');

  return (
    <SafeAreaView style={commonStyles.safeArea} edges={['top']}>
      {/* Segment Control */}
      <View style={styles.segmentContainer}>
        <View style={styles.segmentRow}>
          {TABS.map(tab => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.segment, activeTab === tab.key && styles.segmentActive]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Text style={[styles.segmentText, activeTab === tab.key && styles.segmentTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Content */}
      <View style={styles.content}>
        {activeTab === 'calendar' && <CalendarScreen embedded />}
        {activeTab === 'analytics' && <AnalyticsScreen embedded />}
        {activeTab === 'photos' && <ProgressPhotosScreen embedded />}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  segmentContainer: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  segmentRow: {
    flexDirection: 'row',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    padding: 3,
  },
  segment: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: borderRadius.md - 2,
  },
  segmentActive: {
    backgroundColor: colors.primary,
  },
  segmentText: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    color: colors.textSecondary,
  },
  segmentTextActive: {
    color: colors.textOnPrimary,
    fontWeight: typography.weight.semibold,
  },
  content: {
    flex: 1,
  },
});

export default ProgressScreen;
