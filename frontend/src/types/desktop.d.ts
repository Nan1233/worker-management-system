export {};

declare global {
    interface Window {
        ktcDesktop?: {
            isDesktop: boolean;
            saveExcel: (token: string, date: string) => Promise<DesktopExcelSyncResult>;
            syncAllExcel: (token: string, date: string) => Promise<DesktopExcelSyncResult>;
            configureAutoSync: (token: string) => Promise<unknown>;
            openExportFolder: (date?: string) => Promise<string>;
            getExportFolder: (date?: string) => Promise<string>;
            openLogFolder: () => Promise<string>;
            onSyncResult: (callback: (result: DesktopExcelSyncResult) => void) => () => void;
            onSyncError: (callback: (error: unknown) => void) => () => void;
        };
    }

    interface DesktopExcelSyncResult {
        success: boolean;
        skipped?: boolean;
        code?: string;
        reason?: string;
        message?: string;
        files?: Array<{
            filePath?: string;
            processName?: string;
            processCode?: string;
            success?: boolean;
            error?: string;
        }>;
        exportRoot?: string;
    }
}
