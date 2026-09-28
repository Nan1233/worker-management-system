const LIMIT = 75;
const STYLE_ID = "ktc-productivity-warning-75-style";

function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .ktc-productivity-warning-75 {
        background: #fff2cc !important;
        color: #000 !important;
        font-weight: 700 !important;
      }
      .ktc-productivity-warning-75::after {
        content: " ⚠";
        color: #b45309;
      }
    `;
    document.head.appendChild(style);
}

function parsePercent(value: string) {
    const match = String(value || "").replace(",", ".").match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : NaN;
}

function scanProductivityTables() {
    installStyle();

    document.querySelectorAll("table").forEach((table) => {
        const headers = Array.from(table.querySelectorAll("thead th")).map((th) =>
            String(th.textContent || "").trim().toLowerCase()
        );

        const productivityIndex = headers.findIndex((header) =>
            header.includes("% năng suất") ||
            header.includes("năng suất %") ||
            header.includes("%ns") ||
            header === "năng suất"
        );

        if (productivityIndex < 0) return;

        table.querySelectorAll("tbody tr").forEach((row) => {
            const cell = row.children[productivityIndex] as HTMLElement | undefined;
            if (!cell) return;

            const value = parsePercent(cell.textContent || "");
            if (Number.isFinite(value) && value <= LIMIT) {
                cell.classList.add("ktc-productivity-warning-75");
                cell.title = "Cảnh báo: năng suất ≤ 75%";
            } else {
                cell.classList.remove("ktc-productivity-warning-75");
                if (cell.title === "Cảnh báo: năng suất ≤ 75%") cell.removeAttribute("title");
            }
        });
    });
}

export function initializeProductivityWarning75() {
    if (typeof document === "undefined") return;

    const start = () => {
        scanProductivityTables();
        const observer = new MutationObserver(scanProductivityTables);
        observer.observe(document.body, { childList: true, subtree: true, characterData: true });
        window.setInterval(scanProductivityTables, 1500);
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
        start();
    }
}
