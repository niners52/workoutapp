import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Share,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { colors, typography, spacing, borderRadius, commonStyles } from '../theme';
import { Card, ListItem, NumberInput, Button } from '../components/common';
import { useData } from '../contexts/DataContext';
import { useAuth } from '../contexts/AuthContext';
import {
  exportToJSON,
  exportToCSV,
  resetStorage,
  validateBackupData,
  restoreFromBackup,
} from '../services/storage';
import { clearHealthKitCache } from '../services/healthKitCache';
import { resetMigration } from '../services/cloudSync';
import {
  processPendingSync,
  pullFromCloud,
  getLastSyncTimestamp,
  getPendingOperationsCount,
  isAuthenticated as checkIsAuthenticated,
} from '../services/syncService';
import { format } from 'date-fns';
import {
  WeekStartDay,
  UnitSystem,
  WorkoutLocation,
  Supplement,
  ALL_TRACKABLE_MUSCLE_GROUPS,
  MUSCLE_GROUP_DISPLAY_NAMES,
  BodyFatFormula,
  BiologicalSex,
  NutritionMode,
} from '../types';
import { FORMULA_DESCRIPTIONS, ALL_FORMULAS } from '../services/bodyFatCalculator';
import { RootStackParamList } from '../navigation/types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function SettingsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { user, signOut } = useAuth();
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
  const [showBodyFatSettings, setShowBodyFatSettings] = useState(false);
  const [showNutritionGoal, setShowNutritionGoal] = useState(false);
  const [newLocationName, setNewLocationName] = useState('');
  const [newSupplementName, setNewSupplementName] = useState('');
  const [editingLocation, setEditingLocation] = useState<WorkoutLocation | null>(null);
  const [editingSupplement, setEditingSupplement] = useState<Supplement | null>(null);

  // Sync status state
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isAuthenticatedForSync, setIsAuthenticatedForSync] = useState(false);

  const loadSyncStatus = useCallback(async () => {
    const [authenticated, lastSync, pending] = await Promise.all([
      checkIsAuthenticated(),
      getLastSyncTimestamp(),
      getPendingOperationsCount(),
    ]);
    setIsAuthenticatedForSync(authenticated);
    setLastSyncTime(lastSync);
    setPendingCount(pending);
  }, []);

  useEffect(() => {
    loadSyncStatus();
  }, [loadSyncStatus]);

  const handleSyncNow = async () => {
    setIsSyncing(true);
    try {
      // Process any pending operations
      const result = await processPendingSync();
      console.log(`Sync complete: ${result.processed} processed, ${result.failed} failed`);

      // Refresh sync status
      await loadSyncStatus();

      if (result.failed > 0) {
        Alert.alert('Sync Partial', `${result.processed} synced, ${result.failed} still pending`);
      } else if (result.processed > 0) {
        Alert.alert('Sync Complete', `${result.processed} operations synced successfully`);
      } else {
        Alert.alert('Already Synced', 'No pending operations to sync');
      }
    } catch (error) {
      console.error('Sync error:', error);
      Alert.alert('Sync Failed', 'Unable to sync with cloud');
    } finally {
      setIsSyncing(false);
    }
  };

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

  const handleClearHealthCache = () => {
    Alert.alert(
      'Clear Health Cache',
      'This will clear all cached HealthKit data (sleep & nutrition). The app will re-fetch fresh data from Apple Health.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear Cache',
          onPress: async () => {
            await clearHealthKitCache();
            Alert.alert('Cache Cleared', 'HealthKit cache has been cleared');
          },
        },
      ]
    );
  };

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out? Your data will remain on this device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await signOut();
            // Clear the auth_skipped flag so auth screen shows again
            await AsyncStorage.removeItem('auth_skipped');
          },
        },
      ]
    );
  };

  const handleResetMigration = async () => {
    await resetMigration();
    Alert.alert('Migration Reset', 'Restart the app to re-sync.');
  };

  const handleRestoreBackup = async () => {
    try {
      // Pick a JSON file
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
      });

      if (result.canceled) {
        return;
      }

      // Read the file content
      const fileUri = result.assets[0].uri;
      const response = await fetch(fileUri);
      const jsonString = await response.text();

      // Validate and get counts
      const validation = await validateBackupData(jsonString);

      if (!validation.isValid) {
        Alert.alert('Invalid Backup', validation.error || 'The selected file is not a valid backup');
        return;
      }

      const { counts, data } = validation;

      // Show confirmation with counts
      const currentCounts = `You have:
• ${counts!.current.exercises} exercises
• ${counts!.current.templates} templates
• ${counts!.current.workouts} workouts
• ${counts!.current.sets} sets
• ${counts!.current.routines} routines
• ${counts!.current.supplements} supplements`;

      const backupCounts = `The backup contains:
• ${counts!.backup.exercises} exercises
• ${counts!.backup.templates} templates
• ${counts!.backup.workouts} workouts
• ${counts!.backup.sets} sets
• ${counts!.backup.routines} routines
• ${counts!.backup.supplements} supplements`;

      Alert.alert(
        'Restore from Backup',
        `This will replace ALL your data with the backup.\n\n${currentCounts}\n\n${backupCounts}\n\nContinue?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Restore',
            style: 'destructive',
            onPress: async () => {
              try {
                await restoreFromBackup(data);
                await refreshAll();
                Alert.alert(
                  'Restore Complete',
                  'Your data has been restored from the backup successfully'
                );
              } catch (error) {
                console.error('Restore failed:', error);
                Alert.alert('Restore Failed', 'Failed to restore data from backup');
              }
            },
          },
        ]
      );
    } catch (error) {
      console.error('Error selecting backup file:', error);
      Alert.alert('Error', 'Failed to read backup file');
    }
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

        {/* Account */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <Card padding="none">
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>
                {user ? user.email : 'Not signed in - local only'}
              </Text>
            </View>
            {user && (
              <View style={[styles.settingRow, styles.settingRowLast]}>
                <TouchableOpacity onPress={handleSignOut} style={styles.signOutButton}>
                  <Text style={styles.signOutText}>Sign Out</Text>
                </TouchableOpacity>
              </View>
            )}
          </Card>
        </View>

        {/* Sync Status */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cloud Sync</Text>
          <Card padding="none">
            {!isAuthenticatedForSync ? (
              <View style={[styles.settingRow, styles.settingRowLast]}>
                <Text style={styles.offlineModeText}>Offline mode - sign in to enable sync</Text>
              </View>
            ) : (
              <>
                <View style={styles.settingRow}>
                  <Text style={styles.settingLabel}>Last synced</Text>
                  <Text style={styles.syncValue}>
                    {lastSyncTime
                      ? format(new Date(lastSyncTime), 'MMM d, h:mm a')
                      : 'Never'}
                  </Text>
                </View>
                {pendingCount > 0 && (
                  <View style={styles.settingRow}>
                    <Text style={styles.settingLabel}>Pending operations</Text>
                    <Text style={styles.pendingCount}>{pendingCount}</Text>
                  </View>
                )}
                <View style={[styles.settingRow, styles.settingRowLast]}>
                  <TouchableOpacity
                    onPress={handleSyncNow}
                    disabled={isSyncing}
                    style={styles.syncButton}
                  >
                    {isSyncing ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Text style={styles.syncButtonText}>Sync Now</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </Card>
        </View>

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
            <ListItem
              title="Units"
              rightElement={
                <View style={styles.segmentedControl}>
                  <TouchableOpacity
                    style={[
                      styles.segment,
                      userSettings.units === 'imperial' && styles.segmentSelected,
                    ]}
                    onPress={() => updateUserSettings({ units: 'imperial' })}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        userSettings.units === 'imperial' && styles.segmentTextSelected,
                      ]}
                    >
                      lbs
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.segment,
                      userSettings.units === 'metric' && styles.segmentSelected,
                    ]}
                    onPress={() => updateUserSettings({ units: 'metric' })}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        userSettings.units === 'metric' && styles.segmentTextSelected,
                      ]}
                    >
                      kg
                    </Text>
                  </TouchableOpacity>
                </View>
              }
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
            <View style={[styles.settingRow, styles.settingRowLast]}>
              <Text style={styles.settingLabel}>Min Sets / Exercise</Text>
              <NumberInput
                value={userSettings.minimumSetsPerExercise ?? 3}
                onChangeValue={(value) => updateUserSettings({ minimumSetsPerExercise: value })}
                min={1}
                max={10}
                step={1}
              />
            </View>
          </Card>
          <Text style={styles.hint}>
            Warn when finishing a workout with fewer sets per exercise
          </Text>
        </View>

        {/* Routines */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Planning</Text>
          <Card padding="none">
            <ListItem
              title="Weekly Routines"
              subtitle="Plan your weekly workout schedule"
              onPress={() => navigation.navigate('Routines')}
              showChevron
              isFirst
              isLast
            />
          </Card>
        </View>

        {/* Daily Goals */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Daily Goals</Text>
          <Card padding="none">
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Sleep (hours)</Text>
              <NumberInput
                value={userSettings.dailyGoals?.sleepHours ?? userSettings.sleepGoal}
                onChangeValue={(value) => {
                  const dailyGoals = { ...(userSettings.dailyGoals || {}), sleepHours: value };
                  updateUserSettings({ dailyGoals, sleepGoal: value });
                }}
                min={4}
                max={12}
                step={0.5}
                allowDecimals
              />
            </View>
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Protein (grams)</Text>
              <NumberInput
                value={userSettings.dailyGoals?.proteinGrams ?? userSettings.proteinGoal}
                onChangeValue={(value) => {
                  const dailyGoals = { ...(userSettings.dailyGoals || {}), proteinGrams: value };
                  updateUserSettings({ dailyGoals, proteinGoal: value });
                }}
                min={50}
                max={400}
                step={10}
              />
            </View>
            <View style={[styles.settingRow, styles.settingRowLast]}>
              <Text style={styles.settingLabel}>Track Training</Text>
              <TouchableOpacity
                style={[
                  styles.toggle,
                  userSettings.dailyGoals?.trackTraining && styles.toggleActive,
                ]}
                onPress={() => {
                  const dailyGoals = {
                    ...(userSettings.dailyGoals || {}),
                    trackTraining: !userSettings.dailyGoals?.trackTraining,
                  };
                  updateUserSettings({ dailyGoals });
                }}
              >
                <Text style={[
                  styles.toggleText,
                  userSettings.dailyGoals?.trackTraining && styles.toggleTextActive,
                ]}>
                  {userSettings.dailyGoals?.trackTraining ? 'On' : 'Off'}
                </Text>
              </TouchableOpacity>
            </View>
          </Card>
        </View>

        {/* Weekly Goals */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Weekly Goals</Text>
          <Card padding="none">
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Total Sleep (hours)</Text>
              <NumberInput
                value={userSettings.weeklyGoals?.sleepHours ?? 49}
                onChangeValue={(value) => {
                  const weeklyGoals = { ...(userSettings.weeklyGoals || {}), sleepHours: value };
                  updateUserSettings({ weeklyGoals });
                }}
                min={28}
                max={84}
                step={1}
              />
            </View>
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Protein Days</Text>
              <NumberInput
                value={userSettings.weeklyGoals?.proteinDays ?? 6}
                onChangeValue={(value) => {
                  const weeklyGoals = { ...(userSettings.weeklyGoals || {}), proteinDays: value };
                  updateUserSettings({ weeklyGoals });
                }}
                min={1}
                max={7}
                step={1}
              />
            </View>
            <View style={[styles.settingRow, styles.settingRowLast]}>
              <Text style={styles.settingLabel}>Training Days</Text>
              <NumberInput
                value={userSettings.weeklyGoals?.trainingDays ?? 5}
                onChangeValue={(value) => {
                  const weeklyGoals = { ...(userSettings.weeklyGoals || {}), trainingDays: value };
                  updateUserSettings({ weeklyGoals });
                }}
                min={1}
                max={7}
                step={1}
              />
            </View>
          </Card>
        </View>

        {/* Nutrition Goal */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.sectionHeader}
            onPress={() => setShowNutritionGoal(!showNutritionGoal)}
          >
            <Text style={styles.sectionTitle}>Nutrition Goal</Text>
            <Text style={styles.expandIcon}>{showNutritionGoal ? '−' : '+'}</Text>
          </TouchableOpacity>

          {showNutritionGoal && (
            <Card padding="none">
              <View style={[styles.settingRow, { flexDirection: 'column', alignItems: 'flex-start' }]}>
                <Text style={[styles.settingLabel, { marginBottom: spacing.md }]}>Mode</Text>
                {(['recomp', 'bulk', 'cut'] as NutritionMode[]).map((mode) => (
                  <TouchableOpacity
                    key={mode}
                    style={[
                      styles.nutritionModeOption,
                      userSettings.nutritionMode === mode && styles.nutritionModeSelected,
                    ]}
                    onPress={() => updateUserSettings({ nutritionMode: mode })}
                  >
                    <View style={styles.formulaHeader}>
                      <View style={styles.formulaRadio}>
                        {userSettings.nutritionMode === mode && (
                          <View style={styles.formulaRadioInner} />
                        )}
                      </View>
                      <Text style={styles.formulaName}>
                        {mode === 'recomp' ? 'Recomp' : mode === 'bulk' ? 'Bulk' : 'Cut'}
                      </Text>
                    </View>
                    <Text style={styles.formulaDescription}>
                      {mode === 'recomp' && 'Stay within a target range. Ring fills when within tolerance of goal.'}
                      {mode === 'bulk' && 'Meet a minimum. Ring fills as you approach your calorie floor.'}
                      {mode === 'cut' && 'Stay under a maximum. Ring turns red if you exceed it.'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.settingRow}>
                <Text style={styles.settingLabel}>
                  {userSettings.nutritionMode === 'bulk' ? 'Minimum Calories' :
                   userSettings.nutritionMode === 'cut' ? 'Maximum Calories' : 'Daily Target'}
                </Text>
                <NumberInput
                  value={userSettings.calorieGoal || 2000}
                  onChangeValue={(value) => updateUserSettings({ calorieGoal: value })}
                  min={1000}
                  max={6000}
                  step={50}
                />
              </View>
              {userSettings.nutritionMode === 'recomp' && (
                <View style={[styles.settingRow, styles.settingRowLast]}>
                  <Text style={styles.settingLabel}>Tolerance %</Text>
                  <NumberInput
                    value={userSettings.calorieTolerancePercent || 10}
                    onChangeValue={(value) => updateUserSettings({ calorieTolerancePercent: value })}
                    min={5}
                    max={15}
                    step={1}
                  />
                </View>
              )}
              {userSettings.nutritionMode !== 'recomp' && (
                <View style={styles.settingRowLast} />
              )}
            </Card>
          )}
          <Text style={styles.hint}>
            Track daily calories with a progress ring on the Analytics screen
          </Text>
        </View>

        {/* Body Fat Calculation */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.sectionHeader}
            onPress={() => setShowBodyFatSettings(!showBodyFatSettings)}
          >
            <Text style={styles.sectionTitle}>Body Fat Calculation</Text>
            <Text style={styles.expandIcon}>{showBodyFatSettings ? '−' : '+'}</Text>
          </TouchableOpacity>

          {showBodyFatSettings && (
            <Card padding="none">
              <View style={styles.settingRow}>
                <Text style={styles.settingLabel}>Biological Sex</Text>
                <View style={styles.segmentedControl}>
                  <TouchableOpacity
                    style={[
                      styles.segment,
                      userSettings.biologicalSex === 'male' && styles.segmentSelected,
                    ]}
                    onPress={() => updateUserSettings({ biologicalSex: 'male' })}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        userSettings.biologicalSex === 'male' && styles.segmentTextSelected,
                      ]}
                    >
                      Male
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.segment,
                      userSettings.biologicalSex === 'female' && styles.segmentSelected,
                    ]}
                    onPress={() => updateUserSettings({ biologicalSex: 'female' })}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        userSettings.biologicalSex === 'female' && styles.segmentTextSelected,
                      ]}
                    >
                      Female
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
              <View style={styles.settingRow}>
                <Text style={styles.settingLabel}>Birth Year</Text>
                <NumberInput
                  value={userSettings.birthYear || new Date().getFullYear() - 30}
                  onChangeValue={(value) => updateUserSettings({ birthYear: value })}
                  min={1920}
                  max={new Date().getFullYear() - 10}
                  step={1}
                />
              </View>
              <View style={[styles.settingRow, styles.settingRowLast, { flexDirection: 'column', alignItems: 'flex-start' }]}>
                <Text style={[styles.settingLabel, { marginBottom: spacing.md }]}>Formula</Text>
                {ALL_FORMULAS.map((formula) => (
                  <TouchableOpacity
                    key={formula}
                    style={[
                      styles.formulaOption,
                      userSettings.bodyFatFormula === formula && styles.formulaOptionSelected,
                    ]}
                    onPress={() => updateUserSettings({ bodyFatFormula: formula })}
                  >
                    <View style={styles.formulaHeader}>
                      <View style={styles.formulaRadio}>
                        {userSettings.bodyFatFormula === formula && (
                          <View style={styles.formulaRadioInner} />
                        )}
                      </View>
                      <Text style={styles.formulaName}>{FORMULA_DESCRIPTIONS[formula].name}</Text>
                    </View>
                    <Text style={styles.formulaDescription}>{FORMULA_DESCRIPTIONS[formula].description}</Text>
                    <Text style={styles.formulaSites}>{FORMULA_DESCRIPTIONS[formula].sites}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Card>
          )}
          <Text style={styles.hint}>
            Used for caliper body fat testing on the Analytics screen
          </Text>
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
              title="Restore from Backup"
              subtitle="Replace all data with a JSON backup"
              onPress={handleRestoreBackup}
              showChevron
            />
            <ListItem
              title="Import from Setgraph"
              subtitle="Import historical workout data"
              onPress={handleImportSetgraph}
              showChevron
            />
            <ListItem
              title="HealthKit Data"
              subtitle="View raw Apple Health data for debugging"
              onPress={() => navigation.navigate('HealthKitData')}
              showChevron
            />
            <ListItem
              title="Clear Health Cache"
              subtitle="Re-fetch fresh data from Apple Health"
              onPress={handleClearHealthCache}
              showChevron
            />
            <ListItem
              title="Reset Migration"
              subtitle="Force re-sync to cloud (DEBUG)"
              onPress={handleResetMigration}
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
  toggle: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.backgroundTertiary,
    borderRadius: borderRadius.md,
    minWidth: 60,
    alignItems: 'center',
  },
  toggleActive: {
    backgroundColor: colors.primary,
  },
  toggleText: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    fontWeight: typography.weight.medium,
  },
  toggleTextActive: {
    color: colors.textOnPrimary,
  },
  checkmark: {
    fontSize: typography.size.md,
    color: colors.primary,
    fontWeight: typography.weight.bold,
  },
  signOutButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  signOutText: {
    fontSize: typography.size.md,
    color: colors.error,
    fontWeight: typography.weight.medium,
  },
  offlineModeText: {
    fontSize: typography.size.md,
    color: colors.textTertiary,
    fontStyle: 'italic',
  },
  syncValue: {
    fontSize: typography.size.md,
    color: colors.textSecondary,
  },
  pendingCount: {
    fontSize: typography.size.md,
    color: colors.warning,
    fontWeight: typography.weight.semibold,
  },
  syncButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  syncButtonText: {
    fontSize: typography.size.md,
    color: colors.primary,
    fontWeight: typography.weight.medium,
  },
  formulaOption: {
    width: '100%',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  formulaOptionSelected: {
    backgroundColor: colors.backgroundTertiary,
  },
  formulaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  formulaRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.primary,
    marginRight: spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  formulaRadioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  formulaName: {
    fontSize: typography.size.md,
    color: colors.text,
    fontWeight: typography.weight.semibold,
  },
  formulaDescription: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginLeft: 28,
    marginBottom: spacing.xs,
  },
  formulaSites: {
    fontSize: typography.size.xs,
    color: colors.textTertiary,
    marginLeft: 28,
    fontStyle: 'italic',
  },
  nutritionModeOption: {
    width: '100%',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  nutritionModeSelected: {
    backgroundColor: colors.backgroundTertiary,
  },
});

export default SettingsScreen;
