import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, typography } from '../theme';
import { RootStackParamList, MainTabParamList } from './types';
import { useAuth } from '../contexts/AuthContext';
import { isMigrationComplete } from '../services/cloudSync';
import { ActiveWorkoutMiniBar, MINI_BAR_HEIGHT } from '../components/workout';
import { useWorkout } from '../contexts/WorkoutContext';

import {
  HomeScreen,
  TrainScreen,
  ProgressScreen,
  SocialScreen,
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
  AccountabilityPartnerScreen,
  ChallengeScreen,
  ProgressPhotosScreen,
  ProgressPhotoViewScreen,
  ProgressPhotoCompareScreen,
} from '../screens';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

// Tab bar icon configuration
const TAB_ICONS: Record<string, {
  type: 'ionicons' | 'material';
  active: string;
  inactive: string;
}> = {
  Home: { type: 'ionicons', active: 'home', inactive: 'home-outline' },
  Train: { type: 'material', active: 'dumbbell', inactive: 'dumbbell' },
  Progress: { type: 'ionicons', active: 'trending-up', inactive: 'trending-up-outline' },
  Social: { type: 'ionicons', active: 'people', inactive: 'people-outline' },
  Profile: { type: 'ionicons', active: 'person-circle', inactive: 'person-circle-outline' },
};

const ACTIVE_TAB_COLOR = '#FFC52F';
const INACTIVE_TAB_COLOR = '#8E8E93';

const TabIcon = ({ name, focused }: { name: string; focused: boolean }) => {
  const config = TAB_ICONS[name];
  const iconName = focused ? config.active : config.inactive;
  const color = focused ? ACTIVE_TAB_COLOR : INACTIVE_TAB_COLOR;
  const size = 24;

  if (config.type === 'material') {
    return (
      <MaterialCommunityIcons
        name={iconName as keyof typeof MaterialCommunityIcons.glyphMap}
        size={size}
        color={color}
        style={{ opacity: focused ? 1 : 0.8 }}
      />
    );
  }

  return (
    <Ionicons
      name={iconName as keyof typeof Ionicons.glyphMap}
      size={size}
      color={color}
    />
  );
};

// Custom tab bar that includes the mini-bar above it
function CustomTabBar({ state, descriptors, navigation }: any) {
  const { isWorkoutActive } = useWorkout();

  return (
    <View style={customTabBarStyles.container}>
      <ActiveWorkoutMiniBar />
      <View style={[
        customTabBarStyles.tabBar,
        isWorkoutActive && customTabBarStyles.tabBarWithMiniBar,
      ]}>
        {state.routes.map((route: any, index: number) => {
          const { options } = descriptors[route.key];
          const label = options.tabBarLabel !== undefined
            ? options.tabBarLabel
            : options.title !== undefined
            ? options.title
            : route.name;

          const isFocused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          return (
            <TouchableOpacity
              key={route.key}
              style={customTabBarStyles.tabItem}
              onPress={onPress}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel}
            >
              <TabIcon name={route.name} focused={isFocused} />
              <Text style={[
                customTabBarStyles.label,
                { color: isFocused ? colors.primary : colors.textTertiary },
              ]}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const customTabBarStyles = StyleSheet.create({
  container: {
    backgroundColor: colors.backgroundSecondary,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.backgroundSecondary,
    borderTopColor: colors.separator,
    borderTopWidth: 0.5,
    paddingVertical: 8,
  },
  tabBarWithMiniBar: {
    borderTopWidth: 0,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  label: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.medium,
    marginTop: 2,
  },
});

function MainTabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => <CustomTabBar {...props} />}
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
        name="Train"
        component={TrainScreen}
        options={{ tabBarLabel: 'Train' }}
      />
      <Tab.Screen
        name="Progress"
        component={ProgressScreen}
        options={{ tabBarLabel: 'Progress' }}
      />
      <Tab.Screen
        name="Social"
        component={SocialScreen}
        options={{ tabBarLabel: 'Social' }}
      />
      <Tab.Screen
        name="Profile"
        component={SettingsScreen}
        options={{ tabBarLabel: 'Profile' }}
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
        <Stack.Screen
          name="AccountabilityPartner"
          component={AccountabilityPartnerScreen}
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="Challenge"
          component={ChallengeScreen}
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="ProgressPhotos"
          component={ProgressPhotosScreen}
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="ProgressPhotoView"
          component={ProgressPhotoViewScreen}
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="ProgressPhotoCompare"
          component={ProgressPhotoCompareScreen}
          options={{
            headerShown: false,
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default AppNavigator;
