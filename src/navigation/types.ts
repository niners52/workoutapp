import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { CompositeScreenProps, NavigatorScreenParams } from '@react-navigation/native';

// Root Stack Navigator
export type RootStackParamList = {
  MainTabs: NavigatorScreenParams<MainTabParamList>;
  StartWorkout: undefined;
  ActiveWorkout: { workoutId: string };
  ExercisePicker: { workoutId: string; onSelect?: (exerciseId: string) => void };
  ExerciseDetail: { exerciseId: string };
  AddExercise: undefined;
  EditExercise: { exerciseId: string };
  TemplateDetail: { templateId: string };
  CreateTemplate: undefined;
  EditTemplate: { templateId: string };
  MuscleGroupDetail: { muscleGroup: string; weekStart: string };
  SetgraphImport: undefined;
  LogPastWorkout: undefined;
};

// Bottom Tab Navigator
export type MainTabParamList = {
  Home: undefined;
  Exercises: undefined;
  Templates: undefined;
  Analytics: undefined;
  Settings: undefined;
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
