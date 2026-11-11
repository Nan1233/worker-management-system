'use strict';

// Classify the origin of physical machine hours. Keep the precedence of
// linked events, missing linked events and legacy machine lines unchanged.
function classifyGiaCongMachineSource({
  hasPhysicalEvent,
  hasMissingLinkedEvent,
  hasMachineLines
}) {
  if (hasPhysicalEvent) {
    return hasMissingLinkedEvent ? 'MACHINE_EVENT_PARTIAL' : 'MACHINE_EVENT';
  }
  if (hasMissingLinkedEvent) {
    return 'MACHINE_EVENT_MISSING';
  }
  return hasMachineLines ? 'MACHINE_LINE' : 'MACHINE_DATA_MISSING';
}

module.exports = { classifyGiaCongMachineSource };
