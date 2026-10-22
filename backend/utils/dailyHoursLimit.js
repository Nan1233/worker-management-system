"use strict";
// 12-hour daily cap. Working time is entered in whole minutes but stored as decimal hours with 4 decimals
// (1 h 40 min = 1.6667), so three such reports add up to 5.0001 h and a strict `> 12` check on a day that is
// exactly 12 h (3 x 1h40 + 7h) rejected a legal day. Compare in whole minutes instead.
const DAILY_HOURS_LIMIT = 12;
const exceedsDailyHoursLimit = (projectedHours, limitHours = DAILY_HOURS_LIMIT) => {
    const projected = Number(projectedHours);
    if (!Number.isFinite(projected)) return false;
    return Math.round(projected * 60) > Math.round(limitHours * 60);
};
module.exports = { DAILY_HOURS_LIMIT, exceedsDailyHoursLimit };
