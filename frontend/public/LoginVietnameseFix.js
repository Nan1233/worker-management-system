/* KTC Login mobile/accessibility compatibility layer.
 * Keeps the employee-code field as text so iPhone can enter both letters and digits.
 * Also translates the remaining legacy English labels on the login screen.
 */
(function () {
  const replacements = new Map([
    ["Welcome back", "Chào mừng bạn quay lại"],
    ["Please sign in to continue", "Vui lòng đăng nhập để tiếp tục"],
    ["Worker Code / Username", "Mã nhân viên / Tên đăng nhập"],
    ["Enter worker code", "Nhập mã nhân viên"],
    ["Sign In", "Đăng nhập"],
    ["PRODUCTION", "SẢN XUẤT"],
    ["WORKER MANAGEMENT", "QUẢN LÝ CÔNG NHÂN"]
  ]);

  function fixLogin(root) {
    const scope = root || document;

    scope.querySelectorAll('input[autocomplete="username"]').forEach(function (input) {
      input.setAttribute("type", "text");
      input.removeAttribute("inputmode");
      input.setAttribute("autocomplete", "username");
      input.setAttribute("enterkeyhint", "next");
    });

    scope.querySelectorAll(".login-page *").forEach(function (element) {
      if (element.children.length === 0) {
        const text = (element.textContent || "").trim();
        const translated = replacements.get(text);
        if (translated) element.textContent = translated;
      }

      if (element instanceof HTMLInputElement && element.placeholder) {
        const translated = replacements.get(element.placeholder);
        if (translated) element.placeholder = translated;
      }
    });
  }

  function start() {
    fixLogin(document);
    const observer = new MutationObserver(function (mutations) {
      let changed = false;
      mutations.forEach(function (mutation) {
        if (mutation.addedNodes && mutation.addedNodes.length) changed = true;
      });
      if (changed) fixLogin(document);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
