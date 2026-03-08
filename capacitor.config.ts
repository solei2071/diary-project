import type { CapacitorConfig } from "@capacitor/cli";

const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim();
const useRemoteCapServer =
  process.env.CAPACITOR_USE_REMOTE_SERVER === "true" && appUrl.length > 0;

const config: CapacitorConfig = {
  appId: "com.dailyflow.diary",
  appName: "Daily Flow Diary",
  webDir: "out",
  ...(useRemoteCapServer
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
