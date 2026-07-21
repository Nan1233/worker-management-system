export {};

type DesktopExcelFile = {
  processId: number;
  processCode?: string;
  processName: string;
  reportCount?: number;
  fileName?: string;
  filePath?: string;
  folder?: string;
  size?: number;
  saved?: boolean;
  pendingPath?: string | null;
  success?: boolean;
  error?: string;
};

type DesktopSyncResult = {
  success: boolean;
  skipped?: boolean;
  reason?: string;
  date?: string;
  files: DesktopExcelFile[];
  rootFolder?: string;
  savedAt?: string;
  elapsedMs?: number;
};

declare global {
  interface Window {
    ktcDesktop?: {
      isDesktop: boolean;
      saveExcel(token: string, date: string): Promise<DesktopSyncResult>;
      syncAllExcel(token: string, date: string): Promise<DesktopSyncResult>;
      configureAutoSync(token: string): Promise<{ success: boolean; enabled: boolean; intervalMinutes: number; exportRoot: string }>;
      openExportFolder(date?: string): Promise<string>;
      getExportFolder(date?: string): Promise<string>;
      openLogFolder(): Promise<string>;
      onSyncResult(callback: (result: DesktopSyncResult) => void): () => void;
      onSyncError(callback: (error: { message: string }) => void): () => void;
    };
  }
}
