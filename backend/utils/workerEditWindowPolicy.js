'use strict';

// Temporary KTC business policy. Set true only when the customer approves
// restoring the 10-minute worker self-edit window. Only pending reports are editable.
const WORKER_EDIT_TIME_LIMIT_ENABLED = false;
const WORKER_EDIT_WINDOW_MS = 10 * 60 * 1000;
const WORKER_EDITABLE_STATUSES = Object.freeze(['pending']);

module.exports = {
    WORKER_EDIT_TIME_LIMIT_ENABLED,
    WORKER_EDIT_WINDOW_MS,
    WORKER_EDITABLE_STATUSES
};
