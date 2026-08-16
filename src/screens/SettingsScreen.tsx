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
  Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, borderRadius, commonStyles } from '../theme';
import { Card, ListItem, NumberInput, Button } from '../components/common';
import { useWorkoutBarPadding } from '../components/workout';
import { useData } from '../contexts/DataContext';
import { useAuth } from '../contexts/AuthContext';
import {
  exportToJSON,
  exportToCSV,
  resetStorage,
  validateBackupData,
  restoreFromBackup,
  getIncompleteWorkouts,
  updateWorkout,
  deleteWorkout,
  clearActiveWorkoutState,
} from '../services/storage';
import { clearHealthKitCache } from '../services/healthKitCache';
import { resetMigration } from '../services/cloudSync';
import {
  syncManager,
  pullFromCloud,
  getLastSyncTimestamp,
  getPendingOperationsCount,
  clearPendingSyncQueue,
  isAuthenticated as checkIsAuthenticated,
  SyncProgress,
} from '../services/syncService';
import { format } from 'date-fns';
import {
  WeekStartDay,
  UnitSystem,
  WorkoutLocation,
  Workout,
  Supplement,
  ALL_TRACKABLE_MUSCLE_GROUPS,
  MUSCLE_GROUP_DISPLAY_NAMES,
  BodyFatFormula,
  BiologicalSex,
  NutritionMode,
} from '../types';
import { FORMULA_DESCRIPTIONS, ALL_FORMULAS } from '../services/bodyFatCalculator';
import { liveActivityService } from '../services/liveActivity';
import { RootStackParamList } from '../navigation/types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export function SettingsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { user, signOut, isOfflineMode, exitOfflineMode } = useAuth();
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
    ptRoutines,
    addPTRoutine,
    updatePTRoutine,
    deletePTRoutine,
    templates,
  } = useData();
  const workoutBarPadding = useWorkoutBarPadding();

  const [showMuscleTargets, setShowMuscleTargets] = useState(false);
  const [showLocations, setShowLocations] = useState(false);
  const [showSupplements, setShowSupplements] = useState(false);
  const [showBodyFatSettings, setShowBodyFatSettings] = useState(false);
  const [showNutritionGoal, setShowNutritionGoal] = useState(false);
  const [showFatigueSettings, setShowFatigueSettings] = useState(false);
  const [showPlannerTimePicker, setShowPlannerTimePicker] = useState(false);
  const [newLocationName, setNewLocationName] = useState('');
  const [newSupplementName, setNewSupplementName] = useState('');
  const [editingLocation, setEditingLocation] = useState<WorkoutLocation | null>(null);
  const [editingSupplement, setEditingSupplement] = useState<Supplement | null>(null);
  const [showPTRoutines, setShowPTRoutines] = useState(false);
  const [newPTName, setNewPTName] = useState('');
  const [editingPTRoutine, setEditingPTRoutine] = useState<any>(null);

  // Sync status state
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isAuthenticatedForSync, setIsAuthenticatedForSync] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);

  // Interrupted workouts state
  const [incompleteWorkouts, setIncompleteWorkouts] = useState<Workout[]>([]);
  const [showIncomplete, setShowIncomplete] = useState(false);

  const loadIncompleteWorkouts = useCallback(async () => {
    const incomplete = await getIncompleteWorkouts();
    setIncompleteWorkouts(incomplete);
  }, []);

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
    loadIncompleteWorkouts();
  }, [loadSyncStatus, loadIncompleteWorkouts]);

  // Subscribe to live sync status updates
  useEffect(() => {
    return syncManager.subscribe(status => {
      setPendingCount(status.pendingCount);
      setIsSyncing(status.isSyncing);
      setLastSyncTime(status.lastSyncTime);
    });
  }, []);

  const handleSyncNow = async () => {
    setSyncProgress(null);
    try {
      const result = await syncManager.processQueue((progress) => {
        setSyncProgress(progress);
      }, true);

      // Refresh sync status
      await loadSyncStatus();
      setSyncProgress(null);

      const parts: string[] = [];
      if (result.processed > 0) parts.push(`${result.processed} synced`);
      if (result.failed > 0) parts.push(`${result.failed} still pending`);

      if (result.failed > 0) {
        Alert.alert('Sync Partial', parts.join(', '));
      } else if (result.processed > 0) {
        Alert.alert('Sync Complete', parts.join(', '));
      } else {
        Alert.alert('Already Synced', 'No pending operations to sync');
      }
    } catch (error) {
      console.error('Sync error:', error);
      setSyncProgress(null);
      Alert.alert('Sync Failed', 'Unable to sync with cloud');
    }
  };

  const handleResetSyncQueue = () => {
    Alert.alert(
      'Reset Sync Queue',
      `This will clear all ${pendingCount} pending sync operations. Data already saved locally won't be affected, but un-synced changes won't be pushed to the cloud.\n\nNew changes you make will sync normally going forward.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset Queue',
          style: 'destructive',
          onPress: async () => {
            await clearPendingSyncQueue();
            // Reset backoff so auto-sync resumes immediately
            await syncManager.onAppResume();
            await loadSyncStatus();
            Alert.alert('Queue Reset', 'Pending sync operations cleared. New changes will sync normally.');
          },
        },
      ]
    );
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

  const handleClearStuckTimers = async () => {
    await liveActivityService.endAllActivities();
    Alert.alert('Timers Cleared', 'All Live Activities and stuck timers have been cleared.');
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

  const handleMuscleTargetMaxChange = (muscleGroup: string, value: number) => {
    const newTargets = {
      ...userSettings.muscleGroupTargetsMax,
      [muscleGroup]: value,
    };
    updateUserSettings({ muscleGroupTargetsMax: newTargets });
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

  const handleAddPTRoutine = async () => {
    if (!newPTName.trim()) return;
    const id = `pt-routine-${Date.now()}`;
    await addPTRoutine({
      id,
      name: newPTName.trim(),
      sortOrder: ptRoutines.length,
      isActive: true,
    });
    setNewPTName('');
  };

  const handleSavePTEdit = async () => {
    if (!editingPTRoutine || !editingPTRoutine.name.trim()) return;
    await updatePTRoutine(editingPTRoutine);
    setEditingPTRoutine(null);
  };

  const handleDeletePTRoutine = (routine: any) => {
    Alert.alert(
      'Delete PT Routine',
      `Are you sure you want to delete "${routine.name}"? All tracking history will be removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deletePTRoutine(routine.id),
        },
      ]
    );
  };

  return (
    <SafeAreaView style={commonStyles.safeArea} edges={['top']}>
      <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingBottom: spacing.xxl + workoutBarPadding }]}>
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
            {!user && isOfflineMode && (
              <View style={[styles.settingRow, styles.settingRowLast]}>
                <TouchableOpacity
                  onPress={() => {
                    Alert.alert(
                      'Sign In to Sync',
                      'Return to the sign-in screen? Your local data stays on this device until sync completes.',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Sign In',
                          onPress: () => {
                            exitOfflineMode().catch(e =>
                              Alert.alert('Error', e?.message || 'Failed to exit offline mode')
                            );
                          },
                        },
                      ]
                    );
                  }}
                  style={styles.signInToSyncButton}
                >
                  <Text style={styles.signInToSyncText}>Sign In to Sync</Text>
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
                {syncProgress && syncProgress.total > 0 && (
                  <View style={styles.settingRow}>
                    <Text style={styles.settingLabel}>Syncing...</Text>
                    <Text style={styles.syncValue}>
                      {syncProgress.processed + syncProgress.failed}/{syncProgress.total}
                    </Text>
                  </View>
                )}
                <View style={styles.settingRow}>
                  <TouchableOpacity
                    onPress={handleSyncNow}
                    disabled={isSyncing}
                    style={styles.syncButton}
                  >
                    {isSyncing ? (
                      <View style={styles.syncingRow}>
                        <ActivityIndicator size="small" color={colors.primary} />
                        <Text style={styles.syncingText}>Syncing...</Text>
                      </View>
                    ) : (
                      <Text style={styles.syncButtonText}>Sync Now</Text>
                    )}
                  </TouchableOpacity>
                </View>
                {pendingCount > 0 && !isSyncing && (
                  <View style={[styles.settingRow, styles.settingRowLast]}>
                    <TouchableOpacity
                      onPress={handleResetSyncQueue}
                      style={styles.syncButton}
                    >
                      <Text style={styles.resetQueueText}>Reset Sync Queue</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )}
          </Card>
        </View>

        {/* Accountability Partner */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Social</Text>
          <Card padding="none">
            <TouchableOpacity
              style={[styles.settingRow, styles.settingRowLast]}
              onPress={() => navigation.navigate('AccountabilityPartner')}
            >
              <Text style={styles.settingLabel}>Accountability Partner</Text>
              <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
            </TouchableOpacity>
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
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Min Sets / Exercise</Text>
              <NumberInput
                value={userSettings.minimumSetsPerExercise ?? 3}
                onChangeValue={(value) => updateUserSettings({ minimumSetsPerExercise: value })}
                min={1}
                max={10}
                step={1}
              />
            </View>
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Target Sets / Exercise</Text>
              <NumberInput
                value={userSettings.defaultTargetSets ?? 3}
                onChangeValue={(value) => updateUserSettings({ defaultTargetSets: value })}
                min={1}
                max={10}
                step={1}
              />
            </View>
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Auto-reorder on Completion</Text>
              <TouchableOpacity
                style={[
                  styles.toggle,
                  userSettings.moveCompletedToBottom !== false && styles.toggleActive,
                ]}
                onPress={() =>
                  updateUserSettings({
                    moveCompletedToBottom: !userSettings.moveCompletedToBottom,
                  })
                }
              >
                <Text style={[
                  styles.toggleText,
                  userSettings.moveCompletedToBottom !== false && styles.toggleTextActive,
                ]}>
                  {userSettings.moveCompletedToBottom !== false ? 'On' : 'Off'}
                </Text>
              </TouchableOpacity>
            </View>
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Coach Suggestions</Text>
              <TouchableOpacity
                style={[
                  styles.toggle,
                  userSettings.coachSuggestionsEnabled !== false && styles.toggleActive,
                ]}
                onPress={() =>
                  updateUserSettings({
                    coachSuggestionsEnabled: userSettings.coachSuggestionsEnabled === false,
                  })
                }
              >
                <Text style={[
                  styles.toggleText,
                  userSettings.coachSuggestionsEnabled !== false && styles.toggleTextActive,
                ]}>
                  {userSettings.coachSuggestionsEnabled !== false ? 'On' : 'Off'}
                </Text>
              </TouchableOpacity>
            </View>
            {userSettings.coachSuggestionsEnabled !== false && (
              <>
                <View style={styles.settingRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.settingLabel}>Coach Tone</Text>
                    <Text style={styles.settingHint}>
                      {(() => {
                        const mode = userSettings.coachMode ?? 'balanced';
                        if (mode === 'encouragement_only') return 'Wins only — no decline warnings';
                        if (mode === 'data_focused') return 'Full analytics, no positive bias';
                        return 'Wins + at most one constructive nudge';
                      })()}
                    </Text>
                  </View>
                </View>
                <View style={[styles.settingRow, coachModeStyles.modeRow]}>
                  <View style={coachModeStyles.segment}>
                    {(['encouragement_only', 'balanced', 'data_focused'] as const).map(mode => {
                      const selected = (userSettings.coachMode ?? 'balanced') === mode;
                      const label = mode === 'encouragement_only'
                        ? 'Encouraging'
                        : mode === 'data_focused'
                        ? 'Data'
                        : 'Balanced';
                      return (
                        <TouchableOpacity
                          key={mode}
                          style={[coachModeStyles.segmentButton, selected && coachModeStyles.segmentButtonSelected]}
                          onPress={() => updateUserSettings({ coachMode: mode })}
                        >
                          <Text style={[coachModeStyles.segmentText, selected && coachModeStyles.segmentTextSelected]}>
                            {label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              </>
            )}
            <View style={[styles.settingRow, styles.settingRowLast]}>
              <Text style={styles.settingLabel}>Milestone Celebrations</Text>
              <TouchableOpacity
                style={[
                  styles.toggle,
                  userSettings.milestoneCelebrationsEnabled !== false && styles.toggleActive,
                ]}
                onPress={() =>
                  updateUserSettings({
                    milestoneCelebrationsEnabled: userSettings.milestoneCelebrationsEnabled === false,
                  })
                }
              >
                <Text style={[
                  styles.toggleText,
                  userSettings.milestoneCelebrationsEnabled !== false && styles.toggleTextActive,
                ]}>
                  {userSettings.milestoneCelebrationsEnabled !== false ? 'On' : 'Off'}
                </Text>
              </TouchableOpacity>
            </View>
          </Card>
          <Text style={styles.hint}>
            Show animated celebrations for plate clubs, big rep jumps, and e1RM records
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

        {/* Progress Photos */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Photos</Text>
          <Card padding="none">
            <ListItem
              title="Progress Photos"
              subtitle="Track physique changes over time"
              onPress={() => navigation.navigate('ProgressPhotos')}
              showChevron
              isFirst
            />
            <View style={[styles.settingRow, styles.settingRowLast]}>
              <Text style={styles.settingLabel}>Lock with Face ID</Text>
              <TouchableOpacity
                style={[
                  styles.toggle,
                  userSettings.progressPhotosLocked && styles.toggleActive,
                ]}
                onPress={() =>
                  updateUserSettings({
                    progressPhotosLocked: !userSettings.progressPhotosLocked,
                  })
                }
              >
                <Text style={[
                  styles.toggleText,
                  userSettings.progressPhotosLocked && styles.toggleTextActive,
                ]}>
                  {userSettings.progressPhotosLocked ? 'On' : 'Off'}
                </Text>
              </TouchableOpacity>
            </View>
          </Card>
          <Text style={styles.hint}>
            Require Face ID or passcode to view progress photos
          </Text>
        </View>

        {/* Fatigue Detection */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.sectionHeader}
            onPress={() => setShowFatigueSettings(!showFatigueSettings)}
          >
            <Text style={styles.sectionTitle}>Fatigue Detection</Text>
            <Text style={styles.expandIcon}>{showFatigueSettings ? '−' : '+'}</Text>
          </TouchableOpacity>

          {showFatigueSettings && (
            <Card padding="none">
              <View style={styles.settingRow}>
                <Text style={styles.settingLabel}>Fatigue Detection</Text>
                <TouchableOpacity
                  style={[
                    styles.toggle,
                    userSettings.fatigueDetectionEnabled !== false && styles.toggleActive,
                  ]}
                  onPress={() =>
                    updateUserSettings({
                      fatigueDetectionEnabled: userSettings.fatigueDetectionEnabled === false,
                    })
                  }
                >
                  <Text style={[
                    styles.toggleText,
                    userSettings.fatigueDetectionEnabled !== false && styles.toggleTextActive,
                  ]}>
                    {userSettings.fatigueDetectionEnabled !== false ? 'On' : 'Off'}
                  </Text>
                </TouchableOpacity>
              </View>
              <View style={styles.settingRow}>
                <Text style={styles.settingLabel}>Sensitivity (%)</Text>
                <NumberInput
                  value={userSettings.fatigueSensitivity ?? 10}
                  onChangeValue={(value) => updateUserSettings({ fatigueSensitivity: value })}
                  min={5}
                  max={25}
                  step={5}
                />
              </View>
              <View style={[styles.settingRow, !userSettings.isOnDeload && styles.settingRowLast]}>
                <Text style={styles.settingLabel}>Currently on Deload</Text>
                <TouchableOpacity
                  style={[
                    styles.toggle,
                    userSettings.isOnDeload && styles.toggleActive,
                  ]}
                  onPress={() =>
                    updateUserSettings({ isOnDeload: !userSettings.isOnDeload })
                  }
                >
                  <Text style={[
                    styles.toggleText,
                    userSettings.isOnDeload && styles.toggleTextActive,
                  ]}>
                    {userSettings.isOnDeload ? 'Yes' : 'No'}
                  </Text>
                </TouchableOpacity>
              </View>
              {userSettings.isOnDeload && (
                <View style={[styles.settingRow, styles.settingRowLast]}>
                  <Text style={styles.settingLabel}>Deload Weight %</Text>
                  <NumberInput
                    value={userSettings.deloadPercentage ?? 50}
                    onChangeValue={(value) => updateUserSettings({ deloadPercentage: value })}
                    min={40}
                    max={60}
                    step={5}
                  />
                </View>
              )}
            </Card>
          )}
          <Text style={styles.hint}>
            Detect declining performance and suggest deloads. Lower % = more sensitive.
          </Text>
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

        {/* Sleep Tracking */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Sleep Tracking</Text>
          <Card padding="none">
            <View style={styles.settingRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingLabel}>Remind if Sleep Missing</Text>
                <Text style={styles.settingHint}>Prompt to log sleep when Watch data is unavailable</Text>
              </View>
              <TouchableOpacity
                style={[
                  styles.toggle,
                  userSettings.sleepFallbackReminderEnabled !== false && styles.toggleActive,
                ]}
                onPress={() =>
                  updateUserSettings({
                    sleepFallbackReminderEnabled: userSettings.sleepFallbackReminderEnabled === false,
                  })
                }
              >
                <Text style={[
                  styles.toggleText,
                  userSettings.sleepFallbackReminderEnabled !== false && styles.toggleTextActive,
                ]}>
                  {userSettings.sleepFallbackReminderEnabled !== false ? 'On' : 'Off'}
                </Text>
              </TouchableOpacity>
            </View>
            <View style={[styles.settingRow, styles.settingRowLast]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingLabel}>Auto-Use Average</Text>
                <Text style={styles.settingHint}>Automatically fill missing sleep with your 30-day average</Text>
              </View>
              <TouchableOpacity
                style={[
                  styles.toggle,
                  userSettings.sleepFallbackAutoAverage && styles.toggleActive,
                ]}
                onPress={() =>
                  updateUserSettings({
                    sleepFallbackAutoAverage: !userSettings.sleepFallbackAutoAverage,
                  })
                }
              >
                <Text style={[
                  styles.toggleText,
                  userSettings.sleepFallbackAutoAverage && styles.toggleTextActive,
                ]}>
                  {userSettings.sleepFallbackAutoAverage ? 'On' : 'Off'}
                </Text>
              </TouchableOpacity>
            </View>
          </Card>
        </View>

        {/* Reminders */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Reminders</Text>
          <Card padding="none">
            <View style={styles.settingRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingLabel}>Plan Your Week</Text>
                <Text style={styles.settingHint}>Weekly notification to set or review your routine</Text>
              </View>
              <TouchableOpacity
                style={[
                  styles.toggle,
                  userSettings.weeklyPlannerReminderEnabled && styles.toggleActive,
                ]}
                onPress={() =>
                  updateUserSettings({
                    weeklyPlannerReminderEnabled: !userSettings.weeklyPlannerReminderEnabled,
                  })
                }
              >
                <Text style={[
                  styles.toggleText,
                  userSettings.weeklyPlannerReminderEnabled && styles.toggleTextActive,
                ]}>
                  {userSettings.weeklyPlannerReminderEnabled ? 'On' : 'Off'}
                </Text>
              </TouchableOpacity>
            </View>
            {userSettings.weeklyPlannerReminderEnabled && (
              <>
                <View style={styles.settingRow}>
                  <Text style={styles.settingLabel}>Day</Text>
                  <View style={plannerStyles.dayRow}>
                    {(['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const).map((label, idx) => {
                      const selected = (userSettings.weeklyPlannerReminderDay ?? 0) === idx;
                      return (
                        <TouchableOpacity
                          key={idx}
                          style={[plannerStyles.dayButton, selected && plannerStyles.dayButtonSelected]}
                          onPress={() => updateUserSettings({ weeklyPlannerReminderDay: idx })}
                        >
                          <Text style={[plannerStyles.dayButtonText, selected && plannerStyles.dayButtonTextSelected]}>
                            {label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
                <View style={[styles.settingRow, styles.settingRowLast]}>
                  <Text style={styles.settingLabel}>Time</Text>
                  <TouchableOpacity
                    style={plannerStyles.timeButton}
                    onPress={() => setShowPlannerTimePicker(true)}
                  >
                    <Text style={plannerStyles.timeButtonText}>
                      {(() => {
                        const h = userSettings.weeklyPlannerReminderHour ?? 19;
                        const m = userSettings.weeklyPlannerReminderMinute ?? 0;
                        const date = new Date();
                        date.setHours(h, m, 0, 0);
                        return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
                      })()}
                    </Text>
                  </TouchableOpacity>
                </View>
                {showPlannerTimePicker && (() => {
                  const date = new Date();
                  date.setHours(
                    userSettings.weeklyPlannerReminderHour ?? 19,
                    userSettings.weeklyPlannerReminderMinute ?? 0,
                    0,
                    0,
                  );
                  return (
                    <DateTimePicker
                      value={date}
                      mode="time"
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      themeVariant="dark"
                      onChange={(event, picked) => {
                        if (Platform.OS === 'android') setShowPlannerTimePicker(false);
                        if (picked && (Platform.OS !== 'android' || event.type === 'set')) {
                          updateUserSettings({
                            weeklyPlannerReminderHour: picked.getHours(),
                            weeklyPlannerReminderMinute: picked.getMinutes(),
                          });
                        }
                      }}
                    />
                  );
                })()}
                {Platform.OS === 'ios' && showPlannerTimePicker && (
                  <TouchableOpacity
                    style={plannerStyles.doneButton}
                    onPress={() => setShowPlannerTimePicker(false)}
                  >
                    <Text style={plannerStyles.doneButtonText}>Done</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
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
            <View style={styles.settingRow}>
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
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Track Yoga (HealthKit)</Text>
              <TouchableOpacity
                style={[
                  styles.toggle,
                  userSettings.trackYoga && styles.toggleActive,
                ]}
                onPress={() => updateUserSettings({ trackYoga: !userSettings.trackYoga })}
              >
                <Text style={[
                  styles.toggleText,
                  userSettings.trackYoga && styles.toggleTextActive,
                ]}>
                  {userSettings.trackYoga ? 'On' : 'Off'}
                </Text>
              </TouchableOpacity>
            </View>
            {userSettings.trackYoga && (
              <View style={styles.settingRow}>
                <Text style={styles.settingLabel}>Yoga Goal (min/week)</Text>
                <NumberInput
                  value={userSettings.weeklyGoals?.yogaMinutes ?? 60}
                  onChangeValue={(value) => {
                    const weeklyGoals = { ...(userSettings.weeklyGoals || {}), yogaMinutes: value };
                    updateUserSettings({ weeklyGoals });
                  }}
                  min={10}
                  max={600}
                  step={10}
                />
              </View>
            )}
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Track Cardio (HealthKit)</Text>
              <TouchableOpacity
                style={[
                  styles.toggle,
                  userSettings.trackCardio && styles.toggleActive,
                ]}
                onPress={() => updateUserSettings({ trackCardio: !userSettings.trackCardio })}
              >
                <Text style={[
                  styles.toggleText,
                  userSettings.trackCardio && styles.toggleTextActive,
                ]}>
                  {userSettings.trackCardio ? 'On' : 'Off'}
                </Text>
              </TouchableOpacity>
            </View>
            {userSettings.trackCardio && (
              <View style={[styles.settingRow, styles.settingRowLast]}>
                <Text style={styles.settingLabel}>Cardio Goal (min/week)</Text>
                <NumberInput
                  value={userSettings.weeklyGoals?.cardioMinutes ?? 60}
                  onChangeValue={(value) => {
                    const weeklyGoals = { ...(userSettings.weeklyGoals || {}), cardioMinutes: value };
                    updateUserSettings({ weeklyGoals });
                  }}
                  min={10}
                  max={600}
                  step={10}
                />
              </View>
            )}
            {!userSettings.trackCardio && (
              <View style={[styles.settingRow, styles.settingRowLast]} />
            )}
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
                <View style={styles.settingRow}>
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
              <View style={[styles.settingRow, styles.settingRowLast]}>
                <Text style={styles.settingLabel}>Sodium Limit (mg)</Text>
                <NumberInput
                  value={userSettings.sodiumLimitMg || 2300}
                  onChangeValue={(value) => updateUserSettings({ sodiumLimitMg: value })}
                  min={500}
                  max={6000}
                  step={100}
                />
              </View>
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
              {Platform.OS === 'ios' && (
                <View style={styles.settingRow}>
                  <Text style={styles.settingLabel}>Body Weight Source</Text>
                  <View style={styles.segmentedControl}>
                    <TouchableOpacity
                      style={[
                        styles.segment,
                        (userSettings.bodyWeightSource ?? 'auto') === 'auto' && styles.segmentSelected,
                      ]}
                      onPress={() => updateUserSettings({ bodyWeightSource: 'auto' })}
                    >
                      <Text
                        style={[
                          styles.segmentText,
                          (userSettings.bodyWeightSource ?? 'auto') === 'auto' && styles.segmentTextSelected,
                        ]}
                      >
                        Apple Health
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.segment,
                        userSettings.bodyWeightSource === 'manual' && styles.segmentSelected,
                      ]}
                      onPress={() => updateUserSettings({ bodyWeightSource: 'manual' })}
                    >
                      <Text
                        style={[
                          styles.segmentText,
                          userSettings.bodyWeightSource === 'manual' && styles.segmentTextSelected,
                        ]}
                      >
                        Manual
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
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
            Used for skinfold body fat calculation on the Analytics screen
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

        {/* Physical Therapy Routines */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.sectionHeader}
            onPress={() => setShowPTRoutines(!showPTRoutines)}
          >
            <Text style={styles.sectionTitle}>Physical Therapy</Text>
            <Text style={styles.expandIcon}>{showPTRoutines ? '−' : '+'}</Text>
          </TouchableOpacity>

          {showPTRoutines && (
            <>
              <View style={styles.settingRow}>
                <Text style={styles.settingLabel}>Track PT</Text>
                <TouchableOpacity
                  style={[
                    styles.toggle,
                    userSettings.dailyGoals?.trackPT && styles.toggleActive,
                  ]}
                  onPress={() => {
                    const dailyGoals = { ...(userSettings.dailyGoals || {}), trackPT: !userSettings.dailyGoals?.trackPT };
                    updateUserSettings({ dailyGoals });
                  }}
                >
                  <Text style={[
                    styles.toggleText,
                    userSettings.dailyGoals?.trackPT && styles.toggleTextActive,
                  ]}>
                    {userSettings.dailyGoals?.trackPT ? 'On' : 'Off'}
                  </Text>
                </TouchableOpacity>
              </View>
              {userSettings.dailyGoals?.trackPT && (
                <View style={styles.settingRow}>
                  <Text style={styles.settingLabel}>PT Days/Week Goal</Text>
                  <NumberInput
                    value={userSettings.weeklyGoals?.ptDays ?? 7}
                    onChangeValue={(value) => {
                      const weeklyGoals = { ...(userSettings.weeklyGoals || {}), ptDays: value };
                      updateUserSettings({ weeklyGoals });
                    }}
                    min={1}
                    max={7}
                    step={1}
                  />
                </View>
              )}
              {ptRoutines.length > 0 && (
                <Card padding="none">
                  {ptRoutines.map((routine, index) => (
                    <View
                      key={routine.id}
                      style={[
                        styles.locationRow,
                        index === ptRoutines.length - 1 && styles.locationRowLast,
                      ]}
                    >
                      {editingPTRoutine?.id === routine.id ? (
                        <View style={styles.editLocationRow}>
                          <TextInput
                            style={styles.locationInput}
                            value={editingPTRoutine.name}
                            onChangeText={(text) =>
                              setEditingPTRoutine({ ...editingPTRoutine, name: text })
                            }
                            autoFocus
                          />
                          <TouchableOpacity
                            onPress={handleSavePTEdit}
                            style={styles.locationAction}
                          >
                            <Text style={styles.locationActionText}>Save</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => setEditingPTRoutine(null)}
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
                            onPress={() => updatePTRoutine({ ...routine, isActive: !routine.isActive })}
                          >
                            <Text style={[
                              styles.locationName,
                              !routine.isActive && styles.supplementInactive
                            ]}>
                              {routine.name}
                            </Text>
                            {!routine.isActive && (
                              <Text style={styles.inactiveBadge}>Inactive</Text>
                            )}
                          </TouchableOpacity>
                          <View style={styles.locationActions}>
                            <TouchableOpacity
                              onPress={() => setEditingPTRoutine(routine)}
                              style={styles.locationAction}
                            >
                              <Text style={styles.locationActionText}>Edit</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => handleDeletePTRoutine(routine)}
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
                  placeholder="New PT routine (e.g., Shoulder rehab)"
                  placeholderTextColor={colors.textTertiary}
                  value={newPTName}
                  onChangeText={setNewPTName}
                  onSubmitEditing={handleAddPTRoutine}
                />
                <Button
                  title="Add"
                  onPress={handleAddPTRoutine}
                  variant="secondary"
                  disabled={!newPTName.trim()}
                />
              </View>
            </>
          )}
          <Text style={styles.hint}>
            Track daily physical therapy completion on the Home screen
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
                  <View style={styles.targetInputs}>
                    <View style={styles.targetInputRow}>
                      <Text style={styles.targetInputLabel}>Min</Text>
                      <NumberInput
                        value={userSettings.muscleGroupTargets[mg] || 0}
                        onChangeValue={(value) => handleMuscleTargetChange(mg, value)}
                        min={0}
                        max={30}
                        step={1}
                      />
                    </View>
                    <View style={styles.targetInputRow}>
                      <Text style={styles.targetInputLabel}>Max</Text>
                      <NumberInput
                        value={userSettings.muscleGroupTargetsMax?.[mg] || 0}
                        onChangeValue={(value) => handleMuscleTargetMaxChange(mg, value)}
                        min={0}
                        max={40}
                        step={1}
                      />
                    </View>
                  </View>
                </View>
              ))}
            </Card>
          )}
          <Text style={styles.hint}>
            Min 0 = track without counting toward weekly score. Max is the ideal
            ceiling — leave 0 for none; it must be above Min to show as a range.
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
              title="Clear Stuck Timers"
              subtitle="Force-clear Live Activities and rest timers"
              onPress={handleClearStuckTimers}
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

        {/* Interrupted Workouts */}
        {incompleteWorkouts.length > 0 && (
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.sectionHeader}
              onPress={() => setShowIncomplete(!showIncomplete)}
            >
              <Text style={styles.sectionTitle}>
                Interrupted Workouts ({incompleteWorkouts.length})
              </Text>
              <Text style={styles.expandIcon}>{showIncomplete ? '−' : '+'}</Text>
            </TouchableOpacity>

            {showIncomplete && (
              <>
                <Card padding="none">
                  {incompleteWorkouts.map((w, index) => {
                    const templateName = w.templateId
                      ? templates.find(t => t.id === w.templateId)?.name || 'Custom Workout'
                      : 'Custom Workout';
                    return (
                      <View
                        key={w.id}
                        style={[
                          styles.locationRow,
                          index === incompleteWorkouts.length - 1 && styles.locationRowLast,
                        ]}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={styles.locationName}>{templateName}</Text>
                          <Text style={styles.hint}>
                            {format(new Date(w.startedAt), 'MMM d, yyyy h:mm a')}
                          </Text>
                        </View>
                        <View style={styles.locationActions}>
                          <TouchableOpacity
                            onPress={() => {
                              Alert.alert(
                                'Mark as Complete',
                                'Set completion time to start time?',
                                [
                                  { text: 'Cancel', style: 'cancel' },
                                  {
                                    text: 'Complete',
                                    onPress: async () => {
                                      await updateWorkout({ ...w, completedAt: w.startedAt });
                                      await clearActiveWorkoutState();
                                      await refreshAll();
                                      loadIncompleteWorkouts();
                                    },
                                  },
                                ]
                              );
                            }}
                            style={styles.locationAction}
                          >
                            <Text style={styles.locationActionText}>Complete</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => {
                              Alert.alert(
                                'Delete Workout',
                                'Delete this workout and all its sets?',
                                [
                                  { text: 'Cancel', style: 'cancel' },
                                  {
                                    text: 'Delete',
                                    style: 'destructive',
                                    onPress: async () => {
                                      await deleteWorkout(w.id);
                                      await clearActiveWorkoutState();
                                      await refreshAll();
                                      loadIncompleteWorkouts();
                                    },
                                  },
                                ]
                              );
                            }}
                            style={styles.locationAction}
                          >
                            <Text style={[styles.locationActionText, styles.locationActionDelete]}>
                              Delete
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}
                </Card>
                <View style={styles.incompleteActions}>
                  <TouchableOpacity
                    onPress={() => {
                      Alert.alert(
                        'Complete All',
                        `Mark all ${incompleteWorkouts.length} interrupted workouts as complete?`,
                        [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Complete All',
                            onPress: async () => {
                              for (const w of incompleteWorkouts) {
                                await updateWorkout({ ...w, completedAt: w.startedAt });
                              }
                              await clearActiveWorkoutState();
                              await refreshAll();
                              loadIncompleteWorkouts();
                            },
                          },
                        ]
                      );
                    }}
                    style={styles.incompleteAction}
                  >
                    <Text style={styles.locationActionText}>Complete All</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      Alert.alert(
                        'Delete All',
                        `Permanently delete all ${incompleteWorkouts.length} interrupted workouts and their sets?`,
                        [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Delete All',
                            style: 'destructive',
                            onPress: async () => {
                              for (const w of incompleteWorkouts) {
                                await deleteWorkout(w.id);
                              }
                              await clearActiveWorkoutState();
                              await refreshAll();
                              loadIncompleteWorkouts();
                            },
                          },
                        ]
                      );
                    }}
                    style={styles.incompleteAction}
                  >
                    <Text style={[styles.locationActionText, styles.locationActionDelete]}>
                      Delete All
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        )}

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
  targetInputs: {
    gap: spacing.xs,
  },
  targetInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  targetInputLabel: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    width: 30,
    textAlign: 'right',
  },
  hint: {
    fontSize: typography.size.sm,
    color: colors.textTertiary,
    marginTop: spacing.sm,
  },
  settingHint: {
    fontSize: typography.size.xs,
    color: colors.textTertiary,
    marginTop: 2,
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
  signInToSyncButton: {
    paddingVertical: spacing.sm,
  },
  signInToSyncText: {
    fontSize: typography.size.md,
    color: colors.primary,
    fontWeight: typography.weight.semibold,
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
  syncingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  syncingText: {
    fontSize: typography.size.sm,
    color: colors.primary,
  },
  resetQueueText: {
    fontSize: typography.size.sm,
    color: colors.error,
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
  incompleteActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.lg,
    marginTop: spacing.md,
  },
  incompleteAction: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
});

const coachModeStyles = StyleSheet.create({
  modeRow: {
    justifyContent: 'center',
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.backgroundTertiary,
    borderRadius: borderRadius.md,
    padding: 2,
  },
  segmentButton: {
    flex: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md - 2,
    alignItems: 'center',
  },
  segmentButtonSelected: {
    backgroundColor: colors.primary,
  },
  segmentText: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    fontWeight: typography.weight.medium,
  },
  segmentTextSelected: {
    color: colors.textOnPrimary,
    fontWeight: typography.weight.semibold,
  },
});

const plannerStyles = StyleSheet.create({
  dayRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  dayButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.backgroundTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayButtonSelected: {
    backgroundColor: colors.primary,
  },
  dayButtonText: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    fontWeight: typography.weight.medium,
  },
  dayButtonTextSelected: {
    color: colors.textOnPrimary,
    fontWeight: typography.weight.semibold,
  },
  timeButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
    backgroundColor: colors.backgroundTertiary,
  },
  timeButtonText: {
    color: colors.text,
    fontSize: typography.size.md,
    fontWeight: typography.weight.medium,
  },
  doneButton: {
    margin: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  doneButtonText: {
    color: colors.textOnPrimary,
    fontWeight: typography.weight.semibold,
  },
});

export default SettingsScreen;
