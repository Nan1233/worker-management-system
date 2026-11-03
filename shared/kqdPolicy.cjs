'use strict';

// Production output always counts every declared NG defect, including KQD.
function safeQuantity(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function calculateProductionOutput({ ok = 0, defects = [] } = {}) {
  const ttOk = safeQuantity(ok);
  const totalNg = (Array.isArray(defects) ? defects : [])
    .reduce((sum, item) => sum + safeQuantity(item?.quantity), 0);
  return {
    totalNg,
    countedNg: totalNg,
    excludedKqd: 0,
    actualOutput: ttOk + totalNg,
    ttOk
  };
}

module.exports = { calculateProductionOutput };
