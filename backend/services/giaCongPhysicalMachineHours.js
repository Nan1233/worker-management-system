'use strict';

// Count a physical machine event once even when multiple workers share it.
// A missing linked event is not replaced with worker participation hours.
function addGiaCongPhysicalMachineHours({ line, events, seenEvents, grossHours }) {
  const eventId = Number(line.machine_event_id) || 0;
  const event = eventId ? events.get(eventId) : null;
  if (event) {
    if (!seenEvents.has(eventId)) {
      seenEvents.add(eventId);
      grossHours += Math.max(0, Number(event.machine_time_hours) || 0);
    }
  } else if (!eventId) {
    grossHours += Math.max(0, Number(line.excel_machine_time_hours ?? line.machine_time_hours) || 0);
  }
  return { grossHours, hasPhysicalEvent: Boolean(event), eventId };
}

module.exports = { addGiaCongPhysicalMachineHours };
