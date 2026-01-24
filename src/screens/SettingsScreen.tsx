import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Share,
  TextInput,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, borderRadius, commonStyles } from '../theme';
import { Card, ListItem, NumberInput, Button } from '../components/common';
import { useData } from '../contexts/DataContext';
import { exportToJSON, exportToCSV, resetStorage } from '../services/storage';
import {
  WeekStartDay,
  WorkoutLocation,
  Supplement,
  ALL_TRACKABLE_MUSCLE_GROUPS,
  MUSCLE_GROUP_DISPLAY_NAMES,
} from '../types';
import { RootStackParamList } from '../navigation/types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function SettingsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const {
    userSettings,
    updateUserSettings,
    refreshAll,
    locations,
    addLocation,
    updateLocation,
    deleteLocation,
    supplements,
    addSupplement,
    updateSupplement,
    deleteSupplement,
  } = useData();

  const [showMuscleTargets, setShowMuscleTargets] = useState(false);
  const [showLocations, setShowLocations] = useState(false);
  const [showSupplements, setShowSupplements] = useState(false);
  const [newLocationName, setNewLocationName] = useState('');
  const [newSupplementName, setNewSupplementName] = useState('');
  const [editingLocation, setEditingLocation] = useState<WorkoutLocation | null>(null);
  const [editingSupplement, setEditingSupplement] = useState<Supplement | null>(null);

  const handleWeekStartChange = (day: WeekStartDay) => {
    updateUserSettings({ weekStartDay: day });
  };

  const handleExportJSON = async () => {
    try {
      const json = await exportToJSON();
      const fileName = `workout_data_${new Date().toISOString().split('T')[0]}.json`;

      // For iOS simulator, we'll use Share
      await Share.share({
        message: json,
        title: 'Workout Data Export',
      });
    } catch (error) {
      Alert.alert('Export Failed', 'Failed to export data as JSON');
    }
  };

  const handleExportCSV = async () => {
    try {
      const csv = await exportToCSV();

      await Share.share({
        message: csv,
        title: 'Workout Data Export (CSV)',
      });
    } catch (error) {
      Alert.alert('Export Failed', 'Failed to export data as CSV');
    }
  };

  const handleImportSetgraph = () => {
    navigation.navigate('SetgraphImport');
  };

  const handleResetData = () => {
    Alert.alert(
      'Reset All Data',
      'This will delete ALL your workout data, exercises, and settings. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset Everything',
          style: 'destructive',
          onPress: async () => {
            await resetStorage();
            await refreshAll();
            Alert.alert('Data Reset', 'All data has been reset to defaults');
          },
        },
      ]
    );
  };

  const handleMuscleTargetChange = (muscleGroup: string, value: number) => {
    const newTargets = {
      ...userSettings.muscleGroupTargets,
      [muscleGroup]: value,
    };
    updateUserSettings({ muscleGroupTargets: newTargets });
  };

  const handleAddLocation = async () => {
    if (!newLocationName.trim()) return;

    const id = newLocationName.toLowerCase().replace(/\s+/g, '-');
    await addLocation({
      id,
      name: newLocationName.trim(),
      sortOrder: locations.length,
    });
    setNewLocationName('');
  };

  const handleEditLocation = (location: WorkoutLocation) => {
    setEditingLocation(location);
  };

  const handleSaveLocationEdit = async () => {
    if (!editingLocation || !editingLocation.name.trim()) return;
    await updateLocation(editingLocation);
    setEditingLocation(null);
  };

  const handleDeleteLocation = (location: WorkoutLocation) => {
    Alert.alert(
      'Delete Location',
      `Are you sure you want to delete "${location.name}"? Templates using this location will no longer appear in the start workout flow.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteLocation(location.id),
        },
      ]
    );
  };

  const handleAddSupplement = async () => {
    if (!newSupplementName.trim()) return;

    const id = `supplement-${Date.now()}`;
    await addSupplement({
      id,
      name: newSupplementName.trim(),
      sortOrder: supplements.length,
      isActive: true,
    });
    setNewSupplementName('');
  };

  const handleEditSupplement = (supplement: Supplement) => {
    setEditingSupplement(supplement);
  };

  const handleSaveSupplementEdit = async () => {
    if (!editingSupplement || !editingSupplement.name.trim()) return;
    await updateSupplement(editingSupplement);
    setEditingSupplement(null);
  };

  const handleToggleSupplementActive = async (supplement: Supplement) => {
    await updateSupplement({ ...supplement, isActive: !supplement.isActive });
  };

  const handleDeleteSupplement = (supplement: Supplement) => {
    Alert.alert(
      'Delete Supplement',
      `Are you sure you want to delete "${supplement.name}"? All tracking history for this supplement will be removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteSupplement(supplement.id),
        },
      ]
    );
  };

  return (
    <SafeAreaView style={commonStyles.safeArea} edges={['top']}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Settings</Text>

        {/* General Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>General</Text>
          <Card padding="none">
            <ListItem
              title="Week Starts On"
              rightElement={
                <View style={styles.segmentedControl}>
                  <TouchableOpacity
                    style={[
                      styles.segment,
                      userSettings.weekStartDay === 'sunday' && styles.segmentSelected,
                    ]}
                    onPress={() => handleWeekStartChange('sunday')}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        userSettings.weekStartDay === 'sunday' && styles.segmentTextSelected,
                      ]}
                    >
                      Sun
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.segment,
                      userSettings.weekStartDay === 'monday' && styles.segmentSelected,
                    ]}
                    onPress={() => handleWeekStartChange('monday')}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        userSettings.weekStartDay === 'monday' && styles.segmentTextSelected,
                      ]}
                    >
                      Mon
                    </Text>
                  </TouchableOpacity>
                </View>
              }
              isFirst
            />
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Rest Timer (seconds)</Text>
              <NumberInput
                value={userSettings.restTimerSeconds}
                onChangeValue={(value) => updateUserSettings({ restTimerSeconds: value })}
                min={30}
                max={300}
                step={15}
              />
            </View>
          </Card>
        </View>

        {/* Goals */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Daily Goals</Text>
          <Card padding="none">
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Protein Goal (g)</Text>
              <NumberInput
                value={userSettings.proteinGoal}
                onChangeValue={(value) => updateUserSettings({ proteinGoal: value })}
                min={50}
                max={400}
                step={10}
              />
            </View>
            <View style={[styles.settingRow, styles.settingRowLast]}>
              <Text style={styles.settingLabel}>Sleep Goal (hours)</Text>
              <NumberInput
                value={userSettings.sleepGoal}
                onChangeValue={(value) => updateUserSettings({ sleepGoal: value })}
                min={4}
                max={12}
                step={0.5}
                allowDecimals
              />
            </View>
          </Card>
        </View>

        {/* Location Management */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.sectionHeader}
            onPress={() => setShowLocations(!showLocations)}
          >
            <Text style={styles.sectionTitle}>Workout Locations</Text>
            <Text style={styles.expandIcon}>{showLocations ? '−' : '+'}</Text>
          </TouchableOpacity>

          {showLocations && (
            <>
              <Card padding="none">
                {locations.map((location, index) => (
                  <View
                    key={location.id}
                    style={[
                      styles.locationRow,
                      index === locations.length - 1 && styles.locationRowLast,
                    ]}
                  >
                    {editingLocation?.id === location.id ? (
                      <View style={styles.editLocationRow}>
                        <TextInput
                          style={styles.locationInput}
                          value={editingLocation.name}
                          onChangeText={(text) =>
                            setEditingLocation({ ...editingLocation, name: text })
                          }
                          autoFocus
                        />
                        <TouchableOpacity
                          onPress={handleSaveLocationEdit}
                          style={styles.locationAction}
                        >
                          <Text style={styles.locationActionText}>Save</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => setEditingLocation(null)}
                          style={styles.locationAction}
                        >
                          <Text style={[styles.locationActionText, styles.locationActionCancel]}>
                            Cancel
                          </Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <>
                        <Text style={styles.locationName}>{location.name}</Text>
                        <View style={styles.locationActions}>
                          <TouchableOpacity
                            onPress={() => handleEditLocation(location)}
                            style={styles.locationAction}
                          >
                            <Text style={styles.locationActionText}>Edit</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => handleDeleteLocation(location)}
                            style={styles.locationAction}
                          >
                            <Text style={[styles.locationActionText, styles.locationActionDelete]}>
                              Delete
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </>
                    )}
                  </View>
                ))}
              </Card>
              <View style={styles.addLocationRow}>
                <TextInput
                  style={styles.addLocationInput}
                  placeholder="New location name"
                  placeholderTextColor={colors.textTertiary}
                  value={newLocationName}
                  onChangeText={setNewLocationName}
                  onSubmitEditing={handleAddLocation}
                />
                <Button
                  title="Add"
                  onPress={handleAddLocation}
                  variant="secondary"
                  disabled={!newLocationName.trim()}
                />
              </View>
            </>
          )}
          <Text style={styles.hint}>
            Locations help organize your templates by where you work out
          </Text>
        </View>

        {/* Supplements Management */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.sectionHeader}
            onPress={() => setShowSupplements(!showSupplements)}
          >
            <Text style={styles.sectionTitle}>Supplements</Text>
            <Text style={styles.expandIcon}>{showSupplements ? '−' : '+'}</Text>
          </TouchableOpacity>

          {showSupplements && (
            <>
              {supplements.length > 0 && (
                <Card padding="none">
                  {supplements.map((supplement, index) => (
                    <View
                      key={supplement.id}
                      style={[
                        styles.locationRow,
                        index === supplements.length - 1 && styles.locationRowLast,
                      ]}
                    >
                      {editingSupplement?.id === supplement.id ? (
                        <View style={styles.editLocationRow}>
                          <TextInput
                            style={styles.locationInput}
                            value={editingSupplement.name}
                            onChangeText={(text) =>
                              setEditingSupplement({ ...editingSupplement, name: text })
                            }
                            autoFocus
                          />
                          <TouchableOpacity
                            onPress={handleSaveSupplementEdit}
                            style={styles.locationAction}
                          >
                            <Text style={styles.locationActionText}>Save</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => setEditingSupplement(null)}
                            style={styles.locationAction}
                          >
                            <Text style={[styles.locationActionText, styles.locationActionCancel]}>
                              Cancel
                            </Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <>
                          <TouchableOpacity
                            style={styles.supplementNameRow}
                            onPress={() => handleToggleSupplementActive(supplement)}
                          >
                            <Text style={[
                              styles.locationName,
                              !supplement.isActive && styles.supplementInactive
                            ]}>
                              {supplement.name}
                            </Text>
                            {!supplement.isActive && (
                              <Text style={styles.inactiveBadge}>Inactive</Text>
                            )}
                          </TouchableOpacity>
                          <View style={styles.locationActions}>
                            <TouchableOpacity
                              onPress={() => handleEditSupplement(supplement)}
                              style={styles.locationAction}
                            >
                              <Text style={styles.locationActionText}>Edit</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => handleDeleteSupplement(supplement)}
                              style={styles.locationAction}
                            >
                              <Text style={[styles.locationActionText, styles.locationActionDelete]}>
                                Delete
                              </Text>
                            </TouchableOpacity>
                          </View>
                        </>
                      )}
                    </View>
                  ))}
                </Card>
              )}
              <View style={styles.addLocationRow}>
                <TextInput
                  style={styles.addLocationInput}
                  placeholder="New supplement name"
                  placeholderTextColor={colors.textTertiary}
                  value={newSupplementName}
                  onChangeText={setNewSupplementName}
                  onSubmitEditing={handleAddSupplement}
                />
                <Button
                  title="Add"
                  onPress={handleAddSupplement}
                  variant="secondary"
                  disabled={!newSupplementName.trim()}
                />
              </View>
            </>
          )}
          <Text style={styles.hint}>
            Track daily supplement intake on the Home screen
          </Text>
        </View>

        {/* Muscle Group Targets */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.sectionHeader}
            onPress={() => setShowMuscleTargets(!showMuscleTargets)}
          >
            <Text style={styles.sectionTitle}>Weekly Volume Targets</Text>
            <Text style={styles.expandIcon}>{showMuscleTargets ? '−' : '+'}</Text>
          </TouchableOpacity>

          {showMuscleTargets && (
            <Card padding="none">
              {ALL_TRACKABLE_MUSCLE_GROUPS.map((mg, index) => (
                <View
                  key={mg}
                  style={[
                    styles.targetRow,
                    index === ALL_TRACKABLE_MUSCLE_GROUPS.length - 1 && styles.targetRowLast,
                  ]}
                >
                  <Text style={styles.muscleLabel}>
                    {MUSCLE_GROUP_DISPLAY_NAMES[mg]}
                  </Text>
                  <NumberInput
                    value={userSettings.muscleGroupTargets[mg] || 0}
                    onChangeValue={(value) => handleMuscleTargetChange(mg, value)}
                    min={0}
                    max={30}
                    step={1}
                  />
                </View>
              ))}
            </Card>
          )}
          <Text style={styles.hint}>
            Set to 0 to track without counting toward weekly score
          </Text>
        </View>

        {/* Data Management */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Data</Text>
          <Card padding="none">
            <ListItem
              title="Export as JSON"
              subtitle="Full backup of all data"
              onPress={handleExportJSON}
              showChevron
              isFirst
            />
            <ListItem
              title="Export as CSV"
              subtitle="Sets only, spreadsheet compatible"
              onPress={handleExportCSV}
              showChevron
            />
            <ListItem
              title="Import from Setgraph"
              subtitle="Import historical workout data"
              onPress={handleImportSetgraph}
              showChevron
              isLast
            />
          </Card>
        </View>

        {/* Danger Zone */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, styles.dangerTitle]}>Danger Zone</Text>
          <Button
            title="Reset All Data"
            onPress={handleResetData}
            variant="destructive"
            fullWidth
          />
        </View>

        {/* App Info */}
        <View style={styles.section}>
          <Text style={styles.versionText}>Workout Tracker v1.0.0</Text>
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
  title: {
    fontSize: typography.size.xxxl,
    fontWeight: typography.weight.bold,
    color: colors.text,
    marginBottom: spacing.lg,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.md,
  },
  expandIcon: {
    fontSize: typography.size.xl,
    color: colors.textSecondary,
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: colors.backgroundTertiary,
    borderRadius: borderRadius.md,
    padding: 2,
  },
  segment: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md - 2,
  },
  segmentSelected: {
    backgroundColor: colors.primary,
  },
  segmentText: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  segmentTextSelected: {
    color: colors.text,
    fontWeight: typography.weight.medium,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  settingRowLast: {
    borderBottomWidth: 0,
  },
  settingLabel: {
    fontSize: typography.size.md,
    color: colors.text,
    flex: 1,
  },
  targetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  targetRowLast: {
    borderBottomWidth: 0,
  },
  muscleLabel: {
    fontSize: typography.size.base,
    color: colors.text,
    flex: 1,
  },
  hint: {
    fontSize: typography.size.sm,
    color: colors.textTertiary,
    marginTop: spacing.sm,
  },
  dangerTitle: {
    color: colors.error,
  },
  versionText: {
    fontSize: typography.size.sm,
    color: colors.textTertiary,
    textAlign: 'center',
  },
  locationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  locationRowLast: {
    borderBottomWidth: 0,
  },
  locationName: {
    fontSize: typography.size.md,
    color: colors.text,
    flex: 1,
  },
  locationActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  locationAction: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  locationActionText: {
    fontSize: typography.size.sm,
    color: colors.primary,
  },
  locationActionCancel: {
    color: colors.textSecondary,
  },
  locationActionDelete: {
    color: colors.error,
  },
  editLocationRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  locationInput: {
    flex: 1,
    fontSize: typography.size.md,
    color: colors.text,
    backgroundColor: colors.backgroundTertiary,
    borderRadius: borderRadius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  addLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  addLocationInput: {
    flex: 1,
    fontSize: typography.size.md,
    color: colors.text,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
  },
  supplementNameRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  supplementInactive: {
    color: colors.textTertiary,
  },
  inactiveBadge: {
    fontSize: typography.size.xs,
    color: colors.textTertiary,
    backgroundColor: colors.backgroundTertiary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
});

export default SettingsScreen;
