import { YoungSerif_400Regular } from '@expo-google-fonts/young-serif';
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/auth';
import { ShellMark } from './src/brand';
import { MainTabs } from './src/navigation';
import LoginScreen from './src/screens/LoginScreen';
import { colors } from './src/theme';
import { ToastProvider } from './src/ui';

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.rust,
    background: colors.paper,
    card: colors.surface,
    text: colors.ink,
    border: colors.line,
  },
};

function Splash() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, gap: 28 }}>
      <ShellMark size={96} />
      <ActivityIndicator color={colors.rust} />
    </View>
  );
}

function Root({ fontsReady }: { fontsReady: boolean }) {
  const { ready, user } = useAuth();
  if (!ready || !fontsReady) return <Splash />;
  if (!user) return <LoginScreen />;
  return (
    <NavigationContainer theme={navTheme}>
      <MainTabs />
    </NavigationContainer>
  );
}

export default function App() {
  // If the font fails to load, carry on with the system font rather than blocking the app.
  const [loaded, error] = useFonts({ YoungSerif: YoungSerif_400Regular });
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <ToastProvider>
          <StatusBar style="dark" />
          <Root fontsReady={loaded || !!error} />
        </ToastProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
