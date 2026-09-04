const DETAIL_SELECTOR = ".pending-reference-page .pending-detail-card";
const BODY_SELECTOR = ".pending-detail-body";
const CODE_SELECTOR = ".pending-detail-code";

function focusDetail(detail: HTMLElement): void {
  const body = detail.querySelector(BODY_SELECTOR) as HTMLElement | null;
  if (body) body.scrollTop = 0;

  // Keep the opened report itself at the top of the viewport so the manager
  // never lands at the bottom of a long detail card when opening a lower row.
  window.requestAnimationFrame(() => {
    const current = document.querySelector(DETAIL_SELECTOR) as HTMLElement | null;
    if (!current) return;
    current.scrollIntoView({ block: "start", inline: "nearest", behavior: "auto" });
    const currentBody = current.querySelector(BODY_SELECTOR) as HTMLElement | null;
    if (currentBody) currentBody.scrollTop = 0;
  });
}

if (document.body) {
  let lastReportCode = "";
  const observer = new MutationObserver(() => {
    const detail = document.querySelector(DETAIL_SELECTOR) as HTMLElement | null;
    if (!detail) {
      lastReportCode = "";
      return;
    }

    const code = detail.querySelector(CODE_SELECTOR)?.textContent?.trim() || "";
    if (code && code !== lastReportCode) {
      lastReportCode = code;
      focusDetail(detail);
    }
  });

  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  window.setTimeout(() => {
    const detail = document.querySelector(DETAIL_SELECTOR) as HTMLElement | null;
    if (detail) focusDetail(detail);
  }, 100);
}
