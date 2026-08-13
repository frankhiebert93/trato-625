import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.trato625.app',
  appName: 'Trato 625',
  // Nothing is bundled: the shell loads the live site, the same way the Android
  // TWA does. `webDir` still has to point somewhere valid for the CLI.
  webDir: 'public',
  server: {
    url: 'https://trato625.com',
    hostname: 'trato625.com',
    androidScheme: 'https',
    iosScheme: 'https',
    cleartext: false,
  },
  ios: {
    // 'never' leaves the WebView full-bleed so the page's own
    // env(safe-area-inset-*) padding positions the sticky header and bottom nav.
    // With 'always', WKWebView applies its own inset too and the sticky header
    // stops covering the status bar strip — content scrolls up under the clock.
    contentInset: 'never',
    backgroundColor: '#FAF3EA',
    limitsNavigationsToAppBoundDomains: true,
  },
  plugins: {
    Camera: {
      // Strings shown in the iOS permission prompts. Apple rejects builds whose
      // usage descriptions are vague about *why* access is needed.
      permissions: ['camera', 'photos'],
    },
  },
};

export default config;
