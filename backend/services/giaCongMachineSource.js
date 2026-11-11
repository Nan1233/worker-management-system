'use strict';

// Classify physical machine-hour provenance without changing accounting totals.
const classifyGiaCongMachineSource = ({ hasPhysicalEvent, hasMissingLinkedEvent, hasMachineLines }) =>
  hasPhysicalEvent
    ? (hasMissingLinkedEvent ? 'MACHINE_EVENT_PARTIAL' : 'MACHINE_EVENT')
    : (hasMissingLinkedEvent ? 'MACHINE_EVENT_MISSING' : (hasMachineLines ? 'MACHINE_LINE' : 'MACHINE_DATA_MISSING'));

module.exports = { classifyGiaCongMachineSource };
