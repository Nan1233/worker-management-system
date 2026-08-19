import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import type { ProductionReport } from "../../types/production";
import {
  approveMachineProductionEvent,
  createMachineProductionEvent,
  getMachineProductionEvent,
  linkMachineEventParticipants,
  updateMachineProductionEvent,
  type MachineProductionEvent,
  type MachineProductionEventDefectInput,
} from "../../services/productionService";

const SHARED_MACHINE_NUMBERS = new Set([5, 6, 7, 11]);
const machineNumber = (value: unknown) => {
  const match = String(value || "").trim().toUpperCase().replace(/\s+/g, "").match(/(?:MÁY|MAY|MACHINE|M)?[-_]?(\d{1,2})$/i);
  return match ? Number(match[1]) : null;
};

interface Props {
  report: ProductionReport;
  line: NonNullable<ProductionReport["machine_lines"]>[number];
  source: "pending" | "approved";
  onChanged?: () => void | Promise<void>;
}

export default function MachineEventPanel({ report, line, source, onChanged }: Props) {
  const required = SHARED_MACHINE_NUMBERS.has(machineNumber(line.machine_code) || -1);
  const [eventIdInput, setEventIdInput] = useState(String(line.machine_event_id || ""));
  const [event, setEvent] = useState<MachineProductionEvent | null>(null);
  const [physicalOk, setPhysicalOk] = useState(Number(line.ok_quantity || 0));
  const [machineHours, setMachineHours] = useState(Number(line.machine_time_hours || 0));
  const [defects, setDefects] = useState<MachineProductionEventDefectInput[]>(
    (line.defects || []).filter((item) => Number(item.quantity || 0) > 0).map((item) => ({
      defect_type_id: item.defect_type_id,
      defect_code: item.defect_code,
      quantity: Number(item.quantity || 0),
      responsible_worker_id: Number(report.worker_id || 0),
    }))
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const participantWorkers = useMemo(() => {
    const ids = new Set<number>();
    (event?.participants || []).forEach((item) => ids.add(Number(item.worker_id)));
    if (Number(report.worker_id) > 0) ids.add(Number(report.worker_id));
    return [...ids];
  }, [event, report.worker_id]);

  const hydrate = (value: MachineProductionEvent) => {
    setEvent(value);
    setEventIdInput(String(value.id));
    setPhysicalOk(Number(value.physical_ok_quantity || 0));
    setMachineHours(Number(value.machine_time_hours || 0));
    setDefects((value.defects || []).map((item) => ({
      defect_type_id: item.defect_type_id,
      defect_code: item.defect_code,
      quantity: Number(item.quantity || 0),
      responsible_worker_id: Number(item.responsible_worker_id || 0),
    })));
  };

  useEffect(() => {
    if (!line.machine_event_id) return;
    void getMachineProductionEvent(Number(line.machine_event_id)).then(hydrate).catch(() => undefined);
  }, [line.machine_event_id]);

  if (!required) return null;

  const message = (err: unknown, fallback: string) => axios.isAxiosError(err) ? err.response?.data?.message || fallback : fallback;

  const createEvent = async () => {
    if (!line.id || !report.process_id || !report.work_date || !report.shift || !line.product_code) return;
    try {
      setBusy(true); setError("");
      const created = await createMachineProductionEvent({
        process_id: Number(report.process_id),
        machine_id: line.machine_id,
        machine_code: line.machine_code,
        product_code: line.product_code,
        work_date: report.work_date,
        shift: report.shift,
        physical_ok_quantity: physicalOk,
        machine_time_hours: machineHours,
        defects,
        temp_machine_line_ids: [Number(line.id)],
      });
      hydrate(created); await onChanged?.();
    } catch (err) { setError(message(err, "Không thể tạo production event.")); }
    finally { setBusy(false); }
  };

  const linkExisting = async () => {
    const eventId = Number(eventIdInput);
    if (!line.id || !Number.isInteger(eventId) || eventId <= 0) { setError("ID event không hợp lệ."); return; }
    try {
      setBusy(true); setError("");
      hydrate(await linkMachineEventParticipants(eventId, [Number(line.id)]));
      await onChanged?.();
    } catch (err) { setError(message(err, "Không thể liên kết production event.")); }
    finally { setBusy(false); }
  };

  const updateEvent = async () => {
    if (!event) return;
    try {
      setBusy(true); setError("");
      hydrate(await updateMachineProductionEvent(event.id, {
        physical_ok_quantity: physicalOk,
        machine_time_hours: machineHours,
        defects,
      }));
      await onChanged?.();
    } catch (err) { setError(message(err, "Không thể cập nhật production event.")); }
    finally { setBusy(false); }
  };

  const approveEvent = async () => {
    if (!event) return;
    try {
      setBusy(true); setError("");
      hydrate(await approveMachineProductionEvent(event.id));
      await onChanged?.();
    } catch (err) { setError(message(err, "Không thể duyệt production event.")); }
    finally { setBusy(false); }
  };

  return <section className="detail-basic-card machine-event-card manager-page">
    <h2>Physical machine event · Máy {line.machine_code}</h2>
    <p className="detail-help">Sản lượng công nhân ở dòng máy là <strong>credited output</strong>. Sản lượng vật lý máy được quản lý một lần tại event này.</p>
    {error && <div className="detail-inline-error">{error}</div>}
    <div className="detail-basic-grid">
      <label className="detail-basic-item"><span>Physical OK</span><input type="number" min="0" step="1" value={physicalOk} onChange={(e)=>setPhysicalOk(Number(e.target.value))}/></label>
      <label className="detail-basic-item"><span>Machine hours</span><input type="number" min="0.01" step="0.01" value={machineHours} onChange={(e)=>setMachineHours(Number(e.target.value))}/></label>
      <div className="detail-basic-item"><span>Event</span><strong>{event ? `#${event.id} · ${event.status}` : "Chưa liên kết"}</strong></div>
      <div className="detail-basic-item"><span>Physical counted</span><strong>{event ? Number(event.physical_counted_output).toLocaleString("vi-VN") : "—"}</strong></div>
    </div>
    <div className="machine-event-defects">
      <strong>NG vật lý / người chịu trách nhiệm</strong>
      {defects.length === 0 && <p>Không có NG vật lý.</p>}
      {defects.map((item, index) => <div className="machine-event-defect-row" key={`${item.defect_type_id || item.defect_code}-${index}`}>
        <span>{item.defect_code || `NG #${item.defect_type_id}`}</span>
        <input type="number" min="0" step="1" value={item.quantity} onChange={(e)=>setDefects((prev)=>prev.map((row,i)=>i===index?{...row,quantity:Number(e.target.value)}:row))}/>
        <select value={item.responsible_worker_id} onChange={(e)=>setDefects((prev)=>prev.map((row,i)=>i===index?{...row,responsible_worker_id:Number(e.target.value)}:row))}>
          {participantWorkers.map((workerId)=><option key={workerId} value={workerId}>Worker #{workerId}</option>)}
        </select>
      </div>)}
    </div>
    {!event ? (source === "pending" ? <div className="machine-event-actions">
      <button type="button" disabled={busy} onClick={()=>void createEvent()}>Tạo event từ dòng này</button>
      <input aria-label="Existing event ID" placeholder="Event ID" value={eventIdInput} onChange={(e)=>setEventIdInput(e.target.value)}/>
      <button type="button" disabled={busy} onClick={()=>void linkExisting()}>Liên kết event có sẵn</button>
    </div> : <div className="detail-warning">Legacy approved line chưa có physical event; cần audit/reconciliation, không tự tạo event lịch sử.</div>) : <div className="machine-event-actions">
      <button type="button" disabled={busy} onClick={()=>void updateEvent()}>Lưu physical truth</button>
      {event.status !== "approved" && <button type="button" disabled={busy} onClick={()=>void approveEvent()}>Duyệt event</button>}
    </div>}
  </section>;
}
