const NO_STANDARD_CODES = new Set(["XUATNHAP", "KTCD", "TAIPP"]);

const normalizeCode = (value: unknown): string => String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");

const isNoStandardProduct = (value: unknown): boolean => {
    const codes = String(value ?? "")
        .split(",")
        .map(normalizeCode)
        .filter(Boolean);
    return codes.length > 0 && codes.every((code) => NO_STANDARD_CODES.has(code));
};

const fixNoStandardRows = (root: ParentNode = document): void => {
    root.querySelectorAll?.(".history-page .history-table tbody tr")?.forEach((row) => {
        const productCell = row.querySelector(".product-cell");
        if (!productCell || !isNoStandardProduct(productCell.textContent)) return;

        const okCell = row.querySelector(".ok-column");
        const ngCell = row.querySelector(".ng-column");
        if (okCell) okCell.textContent = "-";
        if (ngCell) ngCell.textContent = "-";
    });
};

let installed = false;

/**
 * XUATNHAP/KTCD/TAIPP là công việc Lồng không có định mức và không có OK/NG.
 * Lịch sử phải hiển thị '-' thay cho giá trị số 0.
 */
export const installProductionHistoryDisplayFix = (): void => {
    if (installed || typeof document === "undefined") return;
    installed = true;

    const run = () => fixNoStandardRows(document);
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", run, { once: true });
    } else {
        run();
    }

    const observer = new MutationObserver(() => run());
    observer.observe(document.body, { childList: true, subtree: true });
};
