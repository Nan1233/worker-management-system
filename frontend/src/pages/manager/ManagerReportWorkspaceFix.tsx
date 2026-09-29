import { useEffect } from "react";

const NON_STANDARD = /\b(?:XUATNHAP|KTCD|TAIPP)\b/i;

function installReportWorkspaceFix() {
  const STYLE_ID = "ktc-manager-report-workspace-fix";
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      @media (min-width: 801px) {
        body.ktc-report-workspace-fix .management-sidebar {
          position: fixed !important;
          inset: 72px 0 auto 0 !important;
          width: 100% !important;
          height: 58px !important;
          min-height: 58px !important;
          padding: 0 18px !important;
          flex-direction: row !important;
          align-items: center !important;
          gap: 14px !important;
          border-right: 0 !important;
          border-bottom: 1px solid #dce8f5 !important;
          box-shadow: 0 3px 12px rgba(24,58,106,.05) !important;
        }
        body.ktc-report-workspace-fix .management-brand {
          width: 120px !important;
          flex: 0 0 120px !important;
          height: 48px !important;
          padding: 2px 4px !important;
        }
        body.ktc-report-workspace-fix .management-brand-logo { width: 112px !important; max-height: 42px !important; }
        body.ktc-report-workspace-fix .management-menu {
          display: flex !important;
          flex: 1 1 auto !important;
          min-width: 0 !important;
          margin-top: 0 !important;
          overflow-x: auto !important;
          overflow-y: hidden !important;
          gap: 4px !important;
          padding: 0 !important;
        }
        body.ktc-report-workspace-fix .management-menu button {
          width: auto !important;
          min-width: max-content !important;
          min-height: 42px !important;
          height: 42px !important;
          padding: 0 13px !important;
          gap: 7px !important;
          white-space: nowrap !important;
        }
        body.ktc-report-workspace-fix .management-sidebar-footer { display: none !important; }
        body.ktc-report-workspace-fix .management-main { margin-left: 0 !important; }
        body.ktc-report-workspace-fix .management-content { padding-top: 84px !important; }
        body.ktc-report-workspace-fix .pending-reference-page { max-width: none !important; }
        body.ktc-report-workspace-fix .pending-workspace {
          grid-template-columns: minmax(0, 1fr) minmax(520px, 43%) !important;
          align-items: start !important;
        }
        body.ktc-report-workspace-fix .pending-list-card { min-width: 0 !important; }
        body.ktc-report-workspace-fix .pending-table-wrap { width: 100% !important; }
        body.ktc-report-workspace-fix .pending-reference-table { min-width: 1120px !important; }
        body.ktc-report-workspace-fix .ktc-report-sequence-nav {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 7px;
          margin: 0 0 8px;
          padding: 0 2px;
        }
        body.ktc-report-workspace-fix .ktc-report-sequence-nav button {
          height: 34px;
          min-width: 76px;
          padding: 0 11px;
          border: 1px solid #c9d9ec;
          border-radius: 8px;
          background: #fff;
          color: #174ea6;
          font-weight: 700;
          cursor: pointer;
        }
        body.ktc-report-workspace-fix .ktc-report-sequence-nav button:disabled { opacity: .4; cursor: not-allowed; }
        body.ktc-report-workspace-fix .ktc-report-sequence-nav span { color: #7185a4; font-size: 12px; margin-right: 4px; }
        body.ktc-report-workspace-fix .ktc-nonstandard-hide { display: none !important; }
      }
    `;
    document.head.appendChild(style);
  }
  document.body.classList.add("ktc-report-workspace-fix");

  let activeIndex = -1;
  let nav: HTMLDivElement | null = null;

  const rows = () => Array.from(document.querySelectorAll<HTMLTableRowElement>(".pending-reference-table tbody tr")).filter((row) => {
    const cells = row.querySelectorAll("td");
    return cells.length > 2 && !row.querySelector(".management-empty,.management-error");
  });

  const selectRow = (index: number) => {
    const list = rows();
    if (!list.length) return;
    const next = Math.max(0, Math.min(index, list.length - 1));
    activeIndex = next;
    list[next].scrollIntoView({ block: "nearest", inline: "nearest" });
    list[next].click();
    refreshNav();
  };

  const refreshNav = () => {
    if (!nav) return;
    const list = rows();
    const detailVisible = !!document.querySelector(".pending-workspace > *:nth-child(2)") && list.length > 0;
    nav.style.display = detailVisible ? "flex" : "none";
    const prev = nav.querySelector<HTMLButtonElement>("[data-dir='prev']");
    const next = nav.querySelector<HTMLButtonElement>("[data-dir='next']");
    const label = nav.querySelector("span");
    if (prev) prev.disabled = activeIndex <= 0;
    if (next) next.disabled = activeIndex < 0 || activeIndex >= list.length - 1;
    if (label) label.textContent = activeIndex >= 0 ? `${activeIndex + 1}/${list.length} · ↑↓ / ←→` : "↑↓ / ←→";
  };

  const mountNav = () => {
    if (nav && nav.isConnected) return;
    const workspace = document.querySelector<HTMLElement>(".pending-workspace");
    if (!workspace) return;
    nav = document.createElement("div");
    nav.className = "ktc-report-sequence-nav";
    nav.innerHTML = `<span>↑↓ / ←→</span><button type="button" data-dir="prev">← Trước</button><button type="button" data-dir="next">Sau →</button>`;
    const detail = workspace.children[1];
    if (detail) detail.insertBefore(nav, detail.firstChild);
    else workspace.insertBefore(nav, workspace.firstChild);
    nav.querySelector<HTMLButtonElement>("[data-dir='prev']")?.addEventListener("click", () => selectRow(activeIndex - 1));
    nav.querySelector<HTMLButtonElement>("[data-dir='next']")?.addEventListener("click", () => selectRow(activeIndex + 1));
  };

  const hideNonStandardSections = () => {
    const workspace = document.querySelector<HTMLElement>(".pending-workspace");
    if (!workspace) return;
    const text = workspace.innerText || "";
    const isNonStandard = NON_STANDARD.test(text);
    workspace.querySelectorAll<HTMLElement>(".ktc-nonstandard-hide").forEach((el) => el.classList.remove("ktc-nonstandard-hide"));
    if (!isNonStandard) return;

    const headings = ["Kết quả sản xuất", "Chỉ số KPI", "Chi tiết lỗi NG của người", "Chi tiết lỗi NG theo máy"];
    const elements = Array.from(workspace.querySelectorAll<HTMLElement>("div,section,h2,h3,h4"));
    for (const heading of headings) {
      const target = elements.find((el) => el.children.length === 0 && el.textContent?.trim() === heading);
      if (!target) continue;
      let parent: HTMLElement | null = target.parentElement;
      for (let i = 0; i < 3 && parent; i += 1) {
        if (parent.children.length >= 1) {
          parent.classList.add("ktc-nonstandard-hide");
          break;
        }
        parent = parent.parentElement;
      }
    }
  };

  const onClick = (event: MouseEvent) => {
    const row = (event.target as Element | null)?.closest<HTMLTableRowElement>(".pending-reference-table tbody tr");
    if (!row) return;
    const list = rows();
    const index = list.indexOf(row);
    if (index >= 0) activeIndex = index;
    window.setTimeout(() => { mountNav(); refreshNav(); hideNonStandardSections(); }, 50);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const target = event.target as HTMLElement | null;
    if (target && /INPUT|TEXTAREA|SELECT/.test(target.tagName)) return;
    const list = rows();
    if (!list.length || activeIndex < 0) return;
    if (["ArrowRight", "ArrowDown"].includes(event.key)) { event.preventDefault(); selectRow(activeIndex + 1); }
    if (["ArrowLeft", "ArrowUp"].includes(event.key)) { event.preventDefault(); selectRow(activeIndex - 1); }
  };

  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKeyDown, true);
  const observer = new MutationObserver(() => { mountNav(); refreshNav(); hideNonStandardSections(); });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  const timer = window.setInterval(() => { mountNav(); refreshNav(); hideNonStandardSections(); }, 500);

  return () => {
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKeyDown, true);
    observer.disconnect();
    window.clearInterval(timer);
    nav?.remove();
    document.body.classList.remove("ktc-report-workspace-fix");
    document.getElementById(STYLE_ID)?.remove();
  };
}

export function ManagerReportsWorkspaceFix() {
  useEffect(() => installReportWorkspaceFix(), []);
  return <div className="ktc-report-fix-host"><ReportsPlaceholder /></div>;
}

export function ManagerApprovedReportsWorkspaceFix() {
  useEffect(() => installReportWorkspaceFix(), []);
  return <div className="ktc-report-fix-host"><ApprovedPlaceholder /></div>;
}

function ReportsPlaceholder() {
  return null;
}

function ApprovedPlaceholder() {
  return null;
}
