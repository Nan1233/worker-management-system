"use strict";

// Physical event metadata belongs to the XLSX audit layer, not layout rendering.
// Reuse the workbook's converters for unchanged number/string semantics.
function createPhysicalMachineMetadata({ asText, asNumber }) {
  function parseMachineDeductionDetails(value) {
    if (Array.isArray(value)) return value;
    if (!value) return [];
    try {
      const parsed = typeof value === 'string' ? JSON.parse(value) : value;
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function machineEventDeductionSnapshot(lines) {
    if (!lines.length) return { hours: null, detailsJson: null, status: 'NO_PARTICIPANT_LINE' };
    const snapshots = lines.map((line) => {
      const details = parseMachineDeductionDetails(line.deductions_json ?? line.deductions)
        .map((item) => ({
          deduction_type_id: Number(item?.deduction_type_id ?? item?.id) || null,
          deduction_code: asText(item?.deduction_code ?? item?.deduction_type_code ?? item?.code),
          deduction_name: asText(item?.deduction_name ?? item?.name),
          hours: Math.max(0, asNumber(item?.hours) || 0)
        }))
        .filter((item) => item.hours > 0)
        .sort((a, b) => (a.deduction_type_id || 0) - (b.deduction_type_id || 0)
          || a.deduction_code.localeCompare(b.deduction_code));
      const detailHours = details.reduce((sum, item) => sum + item.hours, 0);
      const hours = Math.max(
        detailHours,
        Math.max(0, asNumber(line.deduction_time_hours) || 0),
        Math.max(0, asNumber(line.adjustment_minutes) || 0) / 60
      );
      return { hours: Number(hours.toFixed(4)), details };
    });
    const signatures = new Set(snapshots.map((item) => JSON.stringify(item)));
    if (signatures.size > 1) {
      return { hours: null, detailsJson: null, status: 'CONFLICTING_PARTICIPANT_LINES' };
    }
    const snapshot = snapshots[0];
    return {
      hours: snapshot.hours,
      detailsJson: JSON.stringify(snapshot.details),
      status: snapshot.hours > 0
        ? (snapshot.details.length ? 'RECORDED_ONCE' : 'TOTAL_ONLY_NO_BREAKDOWN')
        : 'NO_DEDUCTION_RECORDED'
    };
  }

  function groupParticipantLinesByEvent(reports) {
    const linesByEvent = new Map();
    for (const report of reports || []) {
      const lines = Array.isArray(report.machineLines) ? report.machineLines : [];
      for (const line of lines) {
        const eventId = Number(line.machine_event_id) || 0;
        if (!eventId) continue;
        if (!linesByEvent.has(eventId)) linesByEvent.set(eventId, []);
        linesByEvent.get(eventId).push(line);
      }
    }
    return linesByEvent;
  }

  function addPhysicalMachineEventsMetadata(workbook, processData) {
    const existing = workbook.getWorksheet('_KTC_MACHINE_EVENTS');
    if (existing) workbook.removeWorksheet(existing.id);
    const sheet = workbook.addWorksheet('_KTC_MACHINE_EVENTS');
    sheet.state = 'veryHidden';
    sheet.addRow([
      'event_id','work_date','shift','machine_id','machine_code','product_code',
      'physical_ok','physical_ng','physical_counted_output','physical_total_output',
      'machine_time_hours','maximum_output','standard_output',
      'status','machine_deduction_hours','machine_deductions_json','machine_deduction_status'
    ]);

    const linesByEvent = groupParticipantLinesByEvent(processData?.reports);
    const seen = new Set();
    for (const event of processData?.physicalMachineEvents || []) {
      const id = Number(event.id || 0);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const deduction = machineEventDeductionSnapshot(linesByEvent.get(id) || []);
      sheet.addRow([
        id, event.work_date || null, asText(event.shift), Number(event.machine_id || 0) || null,
        asText(event.machine_code), asText(event.product_code),
        asNumber(event.physical_ok_quantity), asNumber(event.physical_ng_quantity),
        asNumber(event.physical_counted_output), asNumber(event.physical_total_output),
        asNumber(event.machine_time_hours), asNumber(event.maximum_output),
        asNumber(event.standard_output),
        asText(event.status), deduction.hours, deduction.detailsJson, deduction.status
      ]);
    }
    return sheet;
  }


  return { machineEventDeductionSnapshot, addPhysicalMachineEventsMetadata };
}

module.exports = { createPhysicalMachineMetadata };
