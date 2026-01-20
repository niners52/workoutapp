import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AppNavigator } from './src/navigation/AppNavigator';
import { DataProvider } from './src/contexts/DataContext';
import { WorkoutProvider } from './src/contexts/WorkoutContext';
import { initializeHealthKit } from './src/services/healthKit';

export default function App() {
  useEffect(() => {
    // Initialize HealthKit on app start
    initializeHealthKit().then(success => {
      if (success) {
        console.log('HealthKit ready');
      }
    });
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <DataProvider>
          <WorkoutProvider>
            <StatusBar style="light" />
            <AppNavigator />
          </WorkoutProvider>
        </DataProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
