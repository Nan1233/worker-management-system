(function () {
  'use strict';
  var LIMIT = 75;
  var STYLE_ID = 'ktc-productivity-warning-75-style';

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = '\n      .ktc-productivity-warning-75 { background:#fff2cc !important; color:#000 !important; font-weight:700 !important; }\n      .ktc-productivity-warning-75::after { content:" ⚠"; color:#b45309; }\n    ';
    document.head.appendChild(style);
  }

  function parsePercent(value) {
    var m = String(value || '').replace(',', '.').match(/-?\d+(?:\.\d+)?/);
    return m ? Number(m[0]) : NaN;
  }

  function scan() {
    installStyle();
    document.querySelectorAll('table').forEach(function (table) {
      var headers = Array.from(table.querySelectorAll('thead th')).map(function (th) {
        return String(th.textContent || '').trim().toLowerCase();
      });
      var index = headers.findIndex(function (h) {
        return h.includes('% năng suất') || h.includes('năng suất %') || h.includes('%ns') || h === 'năng suất';
      });
      if (index < 0) return;

      table.querySelectorAll('tbody tr').forEach(function (row) {
        var cells = row.children;
        if (!cells[index]) return;
        var cell = cells[index];
        var value = parsePercent(cell.textContent);
        if (Number.isFinite(value) && value <= LIMIT) {
          cell.classList.add('ktc-productivity-warning-75');
          cell.title = 'Cảnh báo: năng suất ≤ 75%';
        } else {
          cell.classList.remove('ktc-productivity-warning-75');
          if (cell.title === 'Cảnh báo: năng suất ≤ 75%') cell.removeAttribute('title');
        }
      });
    });
  }

  var observer = new MutationObserver(function () { scan(); });
  function start() {
    scan();
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.setInterval(scan, 1500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
