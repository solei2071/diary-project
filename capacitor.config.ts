import type { CapacitorConfig } from "@capacitor/cli";

const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim();
const isProductionCapServer = appUrl.length > 0;

const config: CapacitorConfig = {
  appId: "com.dailyflow.diary",
  appName: "Daily Flow Diary",
  webDir: "out",
  ...(isProductionCapServer
    ? {
        server: {
          url: appUrl,
          cleartext: false
        }
      }
    : {}),
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 0
    }
  }
};

export default config;
