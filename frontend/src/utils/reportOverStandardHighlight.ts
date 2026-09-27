const TABLE_SELECTOR = ".pending-reference-table";
const ROW_CLASS = "report-over-standard";

function refresh() {
    document.querySelectorAll<HTMLTableElement>(TABLE_SELECTOR).forEach((table) => {
        table.querySelectorAll<HTMLTableRowElement>("tbody tr").forEach((row) => {
            const cells = row.cells;
            if (cells.length < 11) return;

            // The manager tables already render % năng suất in column 11.
            // > 100% is exactly actual output > standard output for the reported time.
            const raw = (cells[10].textContent || "").replace(/[%\s.,]/g, (ch) => ch === "," ? "." : "");
            const productivity = Number.parseFloat(raw);
            row.classList.toggle(ROW_CLASS, Number.isFinite(productivity) && productivity > 100);
        });
    });
}

let scheduled = false;
function scheduleRefresh() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
        scheduled = false;
        refresh();
    });
}

const observer = new MutationObserver(scheduleRefresh);
observer.observe(document.body, { childList: true, subtree: true, characterData: true });

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", refresh, { once: true });
} else {
    refresh();
}
