import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { CompositeScreenProps, NavigatorScreenParams } from '@react-navigation/native';

// Root Stack Navigator
export type RootStackParamList = {
  Auth: undefined;
  Migration: undefined;
  MainTabs: NavigatorScreenParams<MainTabParamList>;
  StartWorkout: undefined;
  ActiveWorkout: { workoutId: string };
  ExercisePicker: { workoutId: string; onSelect?: (exerciseId: string) => void };
  ExerciseDetail: { exerciseId: string };
  ExerciseHistory: { exerciseId: string };
  AddExercise: undefined;
  EditExercise: { exerciseId: string };
  TemplateDetail: { templateId: string };
  CreateTemplate: undefined;
  EditTemplate: { templateId: string };
  MuscleGroupDetail: { muscleGroup: string; weekStart: string };
  WorkoutDetail: { workoutId: string };
  SetgraphImport: undefined;
  LogPastWorkout: undefined;
  Routines: undefined;
  RoutineDetail: { routineId: string };
  CreateRoutine: undefined;
  EditRoutine: { routineId: string };
  HealthKitData: undefined;
  WorkoutSummary: {
    workoutId: string;
    startedAt: string;
    completedAt: string;
    totalSets: number;
    muscleGroupSets: { muscleGroup: string; sets: number; isSecondary: boolean }[];
    sessionPRs?: {
      setId: string;
      exerciseId: string;
      prTypes: ('weight' | 'reps' | 'volume' | 'e1rm')[];
      isMilestone: boolean;
      milestoneLabel?: string;
    }[];
  };
  MeasurementHistory: { measurementType: string };
  AccountabilityPartner: undefined;
  Challenge: { partnershipId: string };
  ProgressPhotos: undefined;
  ProgressPhotoView: { photoId: string };
  ProgressPhotoCompare: { photoId1?: string; photoId2?: string };
};

// Bottom Tab Navigator
export type MainTabParamList = {
  Home: undefined;
  Train: undefined;
  Progress: undefined;
  Social: undefined;
  Profile: undefined;
};

// Screen props types
export type RootStackScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;

export type MainTabScreenProps<T extends keyof MainTabParamList> =
  CompositeScreenProps<
    BottomTabScreenProps<MainTabParamList, T>,
    NativeStackScreenProps<RootStackParamList>
  >;

// Declare global types for useNavigation hook
declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
