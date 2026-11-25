'use strict';
const toPositiveInteger = (value) => {
    const numberValue = Number(value);
    return Number.isSafeInteger(numberValue) && numberValue > 0 ? numberValue : null;
};

module.exports = { toPositiveInteger };
