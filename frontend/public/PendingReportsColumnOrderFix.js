(() => {
  const run = () => {
    if (!window.location.hash.includes('#/manager/reports')) return;
    const tables = document.querySelectorAll('.pending-reference-table');
    tables.forEach((table) => {
      const header = table.tHead?.rows[0];
      if (!header || header.dataset.kpiOrderFixed || !header.dataset.fullPending) return;
      const bodyRows = Array.from(table.tBodies[0]?.rows || []);
      const order = [13, 12, 11, 10, 9, 8];
      const headerCells = Array.from(header.cells);
      const status = headerCells[headerCells.length - 1];
      const fragment = document.createDocumentFragment();
      order.forEach(index => { const cell = headerCells[index]; if (cell) fragment.appendChild(cell); });
      status.before(fragment);
      bodyRows.forEach(row => {
        const cells = Array.from(row.cells);
        const currentStatus = cells[cells.length - 1];
        const metricFragment = document.createDocumentFragment();
        order.forEach(index => { const cell = cells[index]; if (cell) metricFragment.appendChild(cell); });
        currentStatus.before(metricFragment);
      });
      header.dataset.kpiOrderFixed = '1';
    });
  };
  const observer = new MutationObserver(() => window.setTimeout(run, 0));
  observer.observe(document.body, { childList: true, subtree: true });
  window.setTimeout(run, 120);
})();
