export {};

declare global {
    interface Window {
        ktcDesktop?: {
            isDesktop: boolean;
            saveExcel: (token: string, date: string) => Promise<DesktopExcelSyncResult>;
            syncAllExcel: (token: string, date: string) => Promise<DesktopExcelSyncResult>;
            previewExcelDbSync: (token: string, yearMonth: string) => Promise<DesktopExcelDbSyncPreview>;
            applyExcelDbSync: (token: string, yearMonth: string) => Promise<DesktopExcelDbSyncResult>;
            configureAutoSync: (token: string) => Promise<unknown>;
            openExportFolder: (date?: string) => Promise<string>;
            getExportFolder: (date?: string) => Promise<string>;
            openLogFolder: () => Promise<string>;
            onSyncResult: (callback: (result: DesktopExcelSyncResult) => void) => () => void;
            onExcelDbSyncResult: (callback: (result: DesktopExcelDbSyncResult) => void) => () => void;
            onSyncError: (callback: (error: unknown) => void) => () => void;
        };
    }

    interface DesktopExcelDbSyncChangePreview {
        id: number | null;
        create?: boolean;
        row?: number;
        invalid?: boolean;
        error?: string;
        expected_updated_at?: string | null;
        source?: { file?: string; sheet?: string; process_code?: string; row?: number };
        preview?: Array<{ field: string; label: string; before: unknown; after: unknown }>;
    }

    interface DesktopExcelDbSyncPreview {
        detected: number;
        yearMonth?: string | null;
        changes: DesktopExcelDbSyncChangePreview[];
        helperUpdatedFiles?: string[];
        helperUpdateErrors?: Array<{ file: string; message: string }>;
    }

    interface DesktopExcelDbSyncResult {
        detected: number;
        succeeded: number;
        failed: number;
        changedMonths?: string[];
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
