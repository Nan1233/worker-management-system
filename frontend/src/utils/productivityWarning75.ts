const LOW_LIMIT = 75;
const HIGH_LIMIT = 100;
const STYLE_ID = "ktc-productivity-warning-style";

function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      /* <=75%: warning yellow */
      .ktc-productivity-warning-75,
      .ktc-productivity-warning-75 > *,
      .ktc-productivity-warning-75 td {
        background: #ffd54f !important;
        color: #000 !important;
        font-weight: 800 !important;
      }
      .ktc-productivity-warning-75 {
        box-shadow: inset 0 0 0 2px #d89b00 !important;
      }
      .ktc-productivity-warning-75::after {
        content: " ⚠";
        color: #8a5200;
      }

      /* >100%: warning pink/red, deliberately strong enough for bright displays */
      .ktc-productivity-warning-over100,
      .ktc-productivity-warning-over100 > *,
      .ktc-productivity-warning-over100 td {
        background: #ff8a9a !important;
        color: #000 !important;
        font-weight: 800 !important;
      }
      .ktc-productivity-warning-over100 {
        box-shadow: inset 0 0 0 2px #e05268 !important;
      }
      .ktc-productivity-warning-over100::after {
        content: " ⚠";
        color: #9f1239;
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
            const lowWarning = Number.isFinite(value) && value <= LOW_LIMIT;
            const highWarning = Number.isFinite(value) && value > HIGH_LIMIT;

            cell.classList.toggle("ktc-productivity-warning-75", lowWarning);
            cell.classList.toggle("ktc-productivity-warning-over100", highWarning);

            if (lowWarning) cell.title = "Cảnh báo: năng suất ≤ 75%";
            else if (highWarning) cell.title = "Cảnh báo: năng suất > 100%";
            else if (cell.title.startsWith("Cảnh báo: năng suất")) cell.removeAttribute("title");
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
