"use strict";

const { DAILY_HOURS_POLICY, isDailyHoursLimitExemptProcess } = require("../config/productionRulePolicy");

const DAILY_HOURS_LIMIT = DAILY_HOURS_POLICY.limitHours;
const DAILY_HOURS_EXCLUDED_PROCESS_CODES = DAILY_HOURS_POLICY.excludedProcessCodes;

const exceedsDailyHoursLimit = (projectedHours, limitHours = DAILY_HOURS_LIMIT) => {
    if (!DAILY_HOURS_POLICY.enabled) return false;
    const projected = Number(projectedHours);
    if (!Number.isFinite(projected)) return false;
    // Values are entered in whole minutes but persisted as decimal hours.
    return Math.round(projected * 60) > Math.round(limitHours * 60);
};

module.exports = {
    DAILY_HOURS_LIMIT,
    DAILY_HOURS_EXCLUDED_PROCESS_CODES,
    exceedsDailyHoursLimit,
    isDailyHoursLimitExemptProcess,
};
