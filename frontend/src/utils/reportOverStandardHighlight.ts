const TABLE_SELECTOR = ".pending-reference-table";
const ROW_CLASS = "report-over-standard";

function parsePercent(value: string) {
    const match = String(value || "").replace(",", ".").match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : NaN;
}

function refresh() {
    document.querySelectorAll<HTMLTableElement>(TABLE_SELECTOR).forEach((table) => {
        const headers = Array.from(table.querySelectorAll("thead th")).map((th) =>
            String(th.textContent || "").trim().toLowerCase()
        );
        const productivityIndex = headers.findIndex((header) =>
            header.includes("% năng suất") ||
            header.includes("năng suất %") ||
            header.includes("%ns") ||
            header === "năng suất" ||
            header === "% hv" ||
            header.includes("% hv")
        );
        if (productivityIndex < 0) return;

        table.querySelectorAll<HTMLTableRowElement>("tbody tr").forEach((row) => {
            const cell = row.cells[productivityIndex];
            if (!cell) return;
            const productivity = parsePercent(cell.textContent || "");
            const over = Number.isFinite(productivity) && productivity > 100;
            row.classList.toggle(ROW_CLASS, over);
            cell.classList.toggle("report-over-standard-cell", over);
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

const start = () => {
    refresh();
    const observer = new MutationObserver(scheduleRefresh);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
};

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
else start();
