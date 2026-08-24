export {};

declare global {
    interface Window {
        ktcDesktop?: {
            isDesktop: boolean;
            saveExcel: (token: string, date: string) => Promise<DesktopExcelSyncResult>;
            syncAllExcel: (token: string, date: string) => Promise<DesktopExcelSyncResult>;
            previewExcelDbSync: (token: string, yearMonth: string) => Promise<DesktopExcelDbSyncPreview>;
            applyExcelDbSync: (token: string, yearMonth: string) => Promise<DesktopExcelDbSyncResult>;
            previewReportImport: (token: string) => Promise<DesktopReportImportPreview>;
            applyReportImport: (token: string, filePath: string) => Promise<DesktopReportImportResult>;
            configureAutoSync: (token: string) => Promise<unknown>;
            openExportFolder: (date?: string) => Promise<string>;
            getExportFolder: (date?: string) => Promise<string>;
            getExportRoot: () => Promise<string>;
            chooseExportRoot: () => Promise<{ canceled: boolean; exportRoot: string }>;
            resetExportRoot: () => Promise<string>;
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

    interface DesktopReportImportPreview extends DesktopExcelDbSyncPreview {
        canceled?: boolean;
        filePath?: string;
        fileName?: string;
        creates?: number;
        updates?: number;
    }

    interface DesktopReportImportResult {
        detected: number;
        succeeded: number;
        failed: number;
        filePath?: string;
        yearMonth?: string | null;
        results?: Array<{ id?: number | null; success?: boolean; create?: boolean; message?: string; code?: string }>;
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
