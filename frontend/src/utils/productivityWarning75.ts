const LIMIT = 75;
const STYLE_ID = "ktc-productivity-warning-75-style";

function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .ktc-productivity-warning-75,
      .ktc-productivity-warning-75 > * {
        background: #ffe08a !important;
        color: #5b3b00 !important;
        font-weight: 800 !important;
      }
      .ktc-productivity-warning-75 {
        box-shadow: inset 0 0 0 2px #f0b429 !important;
      }
      .ktc-productivity-warning-75::after {
        content: " ⚠";
        color: #a15c00;
      }
    `;
    document.head.appendChild(style);
}

function parsePercent(value: string) {
    const match = String(value || "").replace(",", ".").match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : NaN;
}

function isProductivityHeader(header: string) {
    return header.includes("% năng suất") ||
        header.includes("năng suất %") ||
        header.includes("%ns") ||
        header === "năng suất" ||
        header === "% hv" ||
        header.includes("% hv");
}

function scanProductivityTables() {
    installStyle();

    document.querySelectorAll("table").forEach((table) => {
        const headers = Array.from(table.querySelectorAll("thead th")).map((th) =>
            String(th.textContent || "").trim().toLowerCase()
        );
        const productivityIndex = headers.findIndex(isProductivityHeader);
        if (productivityIndex < 0) return;

        table.querySelectorAll("tbody tr").forEach((row) => {
            const cell = row.children[productivityIndex] as HTMLElement | undefined;
            if (!cell) return;
            const value = parsePercent(cell.textContent || "");
            const warning = Number.isFinite(value) && value <= LIMIT;
            cell.classList.toggle("ktc-productivity-warning-75", warning);
            if (warning) cell.title = "Cảnh báo: năng suất ≤ 75%";
            else if (cell.title === "Cảnh báo: năng suất ≤ 75%") cell.removeAttribute("title");
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
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
    else start();
}
