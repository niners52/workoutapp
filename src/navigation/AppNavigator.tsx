import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, typography } from '../theme';
import { RootStackParamList, MainTabParamList } from './types';
import { useAuth } from '../contexts/AuthContext';
import { isMigrationComplete } from '../services/cloudSync';

import {
  HomeScreen,
  CalendarScreen,
  StartWorkoutScreen,
  ActiveWorkoutScreen,
  ExercisePickerScreen,
  ExercisesScreen,
  ExerciseDetailScreen,
  ExerciseHistoryScreen,
  AddExerciseScreen,
  TemplatesScreen,
  TemplateDetailScreen,
  CreateTemplateScreen,
  AnalyticsScreen,
  MuscleGroupDetailScreen,
  WorkoutDetailScreen,
  SettingsScreen,
  SetgraphImportScreen,
  LogPastWorkoutScreen,
  RoutinesScreen,
  CreateRoutineScreen,
  RoutineDetailScreen,
  HealthKitDataScreen,
  WorkoutSummaryScreen,
  MeasurementHistoryScreen,
  AuthScreen,
  MigrationScreen,
} from '../screens';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

// Tab bar icons using emoji (can be replaced with proper icons)
const TabIcon = ({ name, focused }: { name: string; focused: boolean }) => {
  const icons: { [key: string]: string } = {
    Home: '🏠',
    Calendar: '📅',
    Exercises: '💪',
    Templates: '📋',
    Analytics: '📊',
    Settings: '⚙️',
  };

  return (
    <Text style={{ fontSize: 24, opacity: focused ? 1 : 0.5 }}>
      {icons[name]}
    </Text>
  );
};

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused }) => <TabIcon name={route.name} focused={focused} />,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarStyle: {
          backgroundColor: colors.backgroundSecondary,
          borderTopColor: colors.separator,
          borderTopWidth: 0.5,
        },
        tabBarLabelStyle: {
          fontSize: typography.size.xs,
          fontWeight: typography.weight.medium,
        },
      })}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ tabBarLabel: 'Home' }}
      />
      <Tab.Screen
        name="Calendar"
        component={CalendarScreen}
        options={{ tabBarLabel: 'Calendar' }}
      />
      <Tab.Screen
        name="Exercises"
        component={ExercisesScreen}
        options={{ tabBarLabel: 'Exercises' }}
      />
      <Tab.Screen
        name="Templates"
        component={TemplatesScreen}
        options={{ tabBarLabel: 'Templates' }}
      />
      <Tab.Screen
        name="Analytics"
        component={AnalyticsScreen}
        options={{ tabBarLabel: 'Analytics' }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ tabBarLabel: 'Settings' }}
      />
    </Tab.Navigator>
  );
}

export function AppNavigator() {
  const { isLoading, isAuthenticated } = useAuth();
  const [authSkipped, setAuthSkipped] = useState(false);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [checkingMigration, setCheckingMigration] = useState(true);

  // Check if user skipped auth
  useEffect(() => {
    AsyncStorage.getItem('auth_skipped').then(value => {
      setAuthSkipped(value === 'true');
    });
  }, []);

  // Check migration status when authenticated
  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      isMigrationComplete().then(complete => {
        setNeedsMigration(!complete);
        setCheckingMigration(false);
      });
    } else {
      setCheckingMigration(false);
    }
  }, [isAuthenticated, isLoading]);

  // Show loading spinner while checking auth state
  if (isLoading || checkingMigration) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // Show auth screen if not authenticated and not skipped
  if (!isAuthenticated && !authSkipped) {
    return (
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Auth" component={AuthScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    );
  }

  // Show migration screen if authenticated but needs migration
  if (isAuthenticated && needsMigration) {
    return (
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Migration">
            {() => <MigrationScreen onComplete={() => setNeedsMigration(false)} />}
          </Stack.Screen>
        </Stack.Navigator>
      </NavigationContainer>
    );
  }

  // Show main app
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerStyle: {
            backgroundColor: colors.background,
          },
          headerTintColor: colors.text,
          headerTitleStyle: {
            fontWeight: typography.weight.semibold,
          },
          headerBackTitle: '',
          contentStyle: {
            backgroundColor: colors.background,
          },
        }}
      >
        <Stack.Screen
          name="MainTabs"
          component={MainTabs}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="StartWorkout"
          component={StartWorkoutScreen}
          options={{
            title: 'Start Workout',
            presentation: 'modal',
          }}
        />
        <Stack.Screen
          name="ActiveWorkout"
          component={ActiveWorkoutScreen}
          options={{
            title: 'Workout',
            headerShown: false,
            gestureEnabled: false, // Prevent swipe-to-dismiss during workout
          }}
        />
        <Stack.Screen
          name="ExercisePicker"
          component={ExercisePickerScreen}
          options={{
            title: 'Add Exercise',
            presentation: 'modal',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="ExerciseDetail"
          component={ExerciseDetailScreen}
          options={{
            title: 'Exercise',
          }}
        />
        <Stack.Screen
          name="ExerciseHistory"
          component={ExerciseHistoryScreen}
          options={{
            title: 'Exercise History',
          }}
        />
        <Stack.Screen
          name="AddExercise"
          component={AddExerciseScreen}
          options={{
            title: 'Add Exercise',
            presentation: 'modal',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="EditExercise"
          component={AddExerciseScreen}
          options={{
            title: 'Edit Exercise',
            presentation: 'modal',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="TemplateDetail"
          component={TemplateDetailScreen}
          options={{
            title: 'Template',
          }}
        />
        <Stack.Screen
          name="CreateTemplate"
          component={CreateTemplateScreen}
          options={{
            title: 'Create Template',
            presentation: 'modal',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="EditTemplate"
          component={CreateTemplateScreen}
          options={{
            title: 'Edit Template',
            presentation: 'modal',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="MuscleGroupDetail"
          component={MuscleGroupDetailScreen}
          options={{
            title: 'Volume Detail',
          }}
        />
        <Stack.Screen
          name="WorkoutDetail"
          component={WorkoutDetailScreen}
          options={{
            title: 'Workout',
          }}
        />
        <Stack.Screen
          name="SetgraphImport"
          component={SetgraphImportScreen}
          options={{
            title: 'Import Data',
          }}
        />
        <Stack.Screen
          name="LogPastWorkout"
          component={LogPastWorkoutScreen}
          options={{
            title: 'Log Past Workout',
            presentation: 'modal',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="Routines"
          component={RoutinesScreen}
          options={{
            title: 'Routines',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="RoutineDetail"
          component={RoutineDetailScreen}
          options={{
            title: 'Routine',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="CreateRoutine"
          component={CreateRoutineScreen}
          options={{
            title: 'Create Routine',
            presentation: 'modal',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="EditRoutine"
          component={CreateRoutineScreen}
          options={{
            title: 'Edit Routine',
            presentation: 'modal',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="HealthKitData"
          component={HealthKitDataScreen}
          options={{
            title: 'HealthKit Data',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="WorkoutSummary"
          component={WorkoutSummaryScreen}
          options={{
            title: 'Workout Complete',
            headerShown: false,
            gestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="MeasurementHistory"
          component={MeasurementHistoryScreen}
          options={{
            title: 'Measurement History',
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default AppNavigator;
