import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.ktchanoi.productioncontrol",
  appName: "KTC Production Control",
  webDir: "dist",
  server: {
    url: "https://worker-management-system-3-dzox.onrender.com",
    androidScheme: "https",
  },
  android: {
    path: "android",
  },
  ios: {
    contentInset: "automatic",
  },
};

export default config;
