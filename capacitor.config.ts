import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.grocerymanager.app',
  appName: 'Grocery Manager',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
