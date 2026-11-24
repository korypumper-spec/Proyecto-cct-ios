import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'mx.org.sntss.normativa',
  appName: 'Normativa IMSS-SNTSS',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#FBF9F5',
  },
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#FBF9F5',
    preferredContentMode: 'mobile',
  },
};

export default config;
