const LOW_LIMIT = 75;
const HIGH_LIMIT = 100;
const STYLE_ID = "ktc-productivity-warning-style";

function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      /* Productivity <=75%: strong red */
      .ktc-productivity-warning-75,
      .ktc-productivity-warning-75 > *,
      .ktc-productivity-warning-75 td {
        background: #ff8a9a !important;
        color: #000 !important;
        font-weight: 800 !important;
        box-shadow: inset 0 0 0 2px #e05268 !important;
      }
      .ktc-productivity-warning-75::after {
        content: " ⚠";
        color: #9f1239;
      }

      /* Productivity >100%: strong red/pink */
      .ktc-productivity-warning-over100,
      .ktc-productivity-warning-over100 > *,
      .ktc-productivity-warning-over100 td {
        background: #ff8a9a !important;
        color: #000 !important;
        font-weight: 800 !important;
        box-shadow: inset 0 0 0 2px #e05268 !important;
      }
      .ktc-productivity-warning-over100::after {
        content: " ⚠";
        color: #9f1239;
      }

      /* %PP / NG: yellow when PP is 0 or exactly one NG type is present */
      .ktc-ng-warning,
      .ktc-ng-warning > *,
      .ktc-ng-warning td {
        background: #ffd54f !important;
        color: #000 !important;
        font-weight: 800 !important;
        box-shadow: inset 0 0 0 2px #d89b00 !important;
      }
      .ktc-ng-warning::after {
        content: " ⚠";
        color: #8a5200;
      }

      /* Detail panel: same warning language, but applied to the KPI field itself. */
      .ktc-detail-productivity-warning,
      .ktc-detail-productivity-warning strong {
        background: #ff8a9a !important;
        color: #000 !important;
        font-weight: 900 !important;
        border-radius: 7px !important;
      }
      .ktc-detail-productivity-warning {
        padding: 5px 7px !important;
        box-shadow: inset 0 0 0 2px #e05268 !important;
      }
      .ktc-detail-ng-warning,
      .ktc-detail-ng-warning strong {
        background: #ffd54f !important;
        color: #000 !important;
        font-weight: 900 !important;
        border-radius: 7px !important;
      }
      .ktc-detail-ng-warning {
        padding: 5px 7px !important;
        box-shadow: inset 0 0 0 2px #d89b00 !important;
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

function isNgPercentHeader(header: string) {
    return header === "% pp" ||
        header.includes("% pp") ||
        header.includes("pp (ng)") ||
        header.includes("%pp");
}

function isNgHeader(header: string) {
    return header === "ng" || header.startsWith("ng ") || header.includes(" ng");
}

/**
 * Read NG-type information when the row/cell exposes it through data attributes,
 * aria-label/title, or child elements. We deliberately do not infer type count
 * from the total NG number (e.g. "101" is a quantity, not a type).
 */
function getNgTypeCount(row: HTMLElement, ngCell: HTMLElement): number | null {
    const candidates: string[] = [];

    for (const el of [row, ngCell]) {
        for (const attr of ["data-ng-types", "data-ng-details", "data-defect-types", "aria-label", "title"]) {
            const value = el.getAttribute(attr);
            if (value) candidates.push(value);
        }
    }

    row.querySelectorAll<HTMLElement>("[data-ng-type], [data-defect-type]").forEach((el) => {
        const value = el.getAttribute("data-ng-type") || el.getAttribute("data-defect-type") || el.textContent || "";
        if (value.trim()) candidates.push(value.trim());
    });

    for (const raw of candidates) {
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return parsed.length;
            if (parsed && Array.isArray(parsed.types)) return parsed.types.length;
            if (parsed && Array.isArray(parsed.items)) return parsed.items.length;
            if (parsed && typeof parsed === "object") {
                const keys = Object.keys(parsed).filter((k) => k && !["total", "count", "quantity"].includes(k));
                if (keys.length) return keys.length;
            }
        } catch {
            const parts = raw.split(/[,;|\n]+/).map((x) => x.trim()).filter(Boolean);
            if (parts.length > 1) return new Set(parts.map((x) => x.toLowerCase())).size;
            if (parts.length === 1 && /[A-Za-zÀ-ỹ]/.test(parts[0])) return 1;
        }
    }

    const typedChildren = Array.from(ngCell.querySelectorAll<HTMLElement>("[data-ng-type], [data-defect-type], .ng-type, .defect-type"))
        .map((el) => (el.textContent || "").trim())
        .filter(Boolean);
    if (typedChildren.length) return new Set(typedChildren.map((x) => x.toLowerCase())).size;

    return null;
}

function scanProductivityTables() {
    installStyle();

    document.querySelectorAll("table").forEach((table) => {
        const headers = Array.from(table.querySelectorAll("thead th")).map((th) =>
            String(th.textContent || "").trim().toLowerCase()
        );
        const productivityIndex = headers.findIndex(isProductivityHeader);
        const ngPercentIndex = headers.findIndex(isNgPercentHeader);
        const ngIndex = headers.findIndex(isNgHeader);
        if (productivityIndex < 0) return;

        table.querySelectorAll("tbody tr").forEach((rowNode) => {
            const row = rowNode as HTMLElement;
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

            // %PP (NG) cell: yellow when PP = 0 or exactly one NG type is exposed.
            if (ngPercentIndex >= 0) {
                const ppCell = row.children[ngPercentIndex] as HTMLElement | undefined;
                const ngCell = ngIndex >= 0 ? row.children[ngIndex] as HTMLElement | undefined : undefined;
                if (ppCell) {
                    const pp = parsePercent(ppCell.textContent || "");
                    const ngTypeCount = ngCell ? getNgTypeCount(row, ngCell) : null;
                    const ppZero = Number.isFinite(pp) && pp === 0;
                    const oneNgType = ngTypeCount === 1;
                    const ngWarning = ppZero || oneNgType;

                    ppCell.classList.toggle("ktc-ng-warning", ngWarning);
                    if (ngWarning) {
                        ppCell.title = ppZero
                            ? "Cảnh báo: %PP (NG) = 0"
                            : "Cảnh báo: chỉ có 1 loại NG";
                    } else if (ppCell.title.startsWith("Cảnh báo: %PP")) {
                        ppCell.removeAttribute("title");
                    }
                }
            }
        });
    });
}

function scanDetailKpi() {
    installStyle();

    document.querySelectorAll<HTMLElement>(".pending-detail-info-grid").forEach((grid) => {
        const fields = Array.from(grid.querySelectorAll<HTMLElement>(".pending-detail-field"));
        const productivityField = fields.find((field) =>
            String(field.querySelector("span")?.textContent || "").trim().toLowerCase().includes("năng suất")
        );
        const ngField = fields.find((field) => {
            const label = String(field.querySelector("span")?.textContent || "").trim().toLowerCase();
            return label.includes("% pp") || label.includes("% ng") || label === "ng%";
        });

        if (productivityField) {
            const value = parsePercent(productivityField.querySelector("strong")?.textContent || "");
            const warning = Number.isFinite(value) && (value <= LOW_LIMIT || value > HIGH_LIMIT);
            productivityField.classList.toggle("ktc-detail-productivity-warning", warning);
        }

        if (ngField) {
            const value = parsePercent(ngField.querySelector("strong")?.textContent || "");
            const ngSection = Array.from(document.querySelectorAll<HTMLElement>(".pending-detail-section")).find((section) =>
                String(section.querySelector("h3")?.textContent || "").trim().toLowerCase().includes("chi tiết lỗi ng")
            );
            const defectTypes = ngSection ? ngSection.querySelectorAll(".pending-defect").length : 0;
            const warning = Number.isFinite(value) && (value === 0 || defectTypes === 1);
            ngField.classList.toggle("ktc-detail-ng-warning", warning);
        }
    });
}

export function initializeProductivityWarning75() {
    if (typeof document === "undefined") return;
    const start = () => {
        scanProductivityTables();
        scanDetailKpi();
        const observer = new MutationObserver(() => {
            scanProductivityTables();
            scanDetailKpi();
        });
        observer.observe(document.body, { childList: true, subtree: true, characterData: true });
        window.setInterval(() => {
            scanProductivityTables();
            scanDetailKpi();
        }, 1500);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
    else start();
}
