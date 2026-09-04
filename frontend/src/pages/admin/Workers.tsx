import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Download, FileSpreadsheet, History, Pencil, Plus, Search, ShieldCheck, Trash2, Upload, UserRound, Users, X } from "lucide-react";
import api from "../../services/api";
import { getActivities, type ActivityItem } from "../../services/systemService";
import { useToast } from "../../components/feedback/toastContext";
import { usePermissions } from "../../hooks/usePermissions";
import "./Workers.css";

type Role = "manager" | "lead" | "worker";
type Tab = "overview" | Role | "activity";
type Person = { id:number; username:string; full_name:string; role:Role; status:string; worker_code?:string|null; phone?:string|null; department?:string|null; position?:string|null; training_percent?:number; process_ids?:string|null; process_names?:string|null; created_at?:string };
type Process = { id:number; process_name:string; process_code?:string };
type ProcessCapacity = Process & { managers:Person[]; leads:Person[]; managerCount:number; leadCount:number };
type FormState = { id?:number; role:Role; username:string; password:string; full_name:string; worker_code:string; phone:string; department:string; position:string; training_percent:string; process_ids:number[]; status:"active"|"inactive" };

const emptyForm: FormState = { role:"worker", username:"", password:"", full_name:"", worker_code:"", phone:"", department:"Sản xuất", position:"Công nhân", training_percent:"100", process_ids:[], status:"active" };
const roleText = (role:string) => role === "manager" ? "Quản lý" : role === "lead" ? "Tổ trưởng" : "Công nhân";
const statusText = (status:string) => status === "active" ? "Đang hoạt động" : "Ngừng hoạt động";
const processIds = (value?:string|null) => String(value || "").split(",").map(Number).filter(n => Number.isInteger(n) && n > 0);

export default function AdminWorkers() {
  const { can } = usePermissions();
  const { showToast } = useToast();
  const canCreate = can("USER_CREATE");
  const canEdit = can("USER_EDIT");
  const [people, setPeople] = useState<Person[]>([]);
  const [processes, setProcesses] = useState<Process[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activityLoading, setActivityLoading] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");
  const [keyword, setKeyword] = useState("");
  const [modal, setModal] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [promotingId, setPromotingId] = useState<number | null>(null);
  const [transferBusy, setTransferBusy] = useState(false);
  const [transferMessage, setTransferMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [usersResponse, processResponse] = await Promise.all([api.get("/users"), api.get("/users/options/processes")]);
      setPeople(usersResponse.data?.data || []);
      setProcesses(processResponse.data?.data || []);
    } catch {
      showToast("Không thể tải dữ liệu tài khoản", "error");
    } finally {
      setLoading(false);
    }
  };

  const loadActivities = async () => {
    setActivityLoading(true);
    try {
      setActivities(await getActivities({ limit: 100 }));
    } catch {
      showToast("Không thể tải nhật ký hoạt động", "error");
    } finally {
      setActivityLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);
  useEffect(() => { if (tab === "activity") void loadActivities(); }, [tab]);

  const managers = useMemo(() => people.filter(p => p.role === "manager"), [people]);
  const leads = useMemo(() => people.filter(p => p.role === "lead"), [people]);
  const workers = useMemo(() => people.filter(p => p.role === "worker"), [people]);
  const active = useMemo(() => people.filter(p => p.status === "active"), [people]);

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    const rows = tab === "manager" ? managers : tab === "lead" ? leads : tab === "worker" ? workers : people;
    if (!q) return rows;
    return rows.filter(p => [p.username, p.full_name, p.worker_code, p.phone, p.department, p.position, p.process_names].join(" ").toLowerCase().includes(q));
  }, [keyword, tab, people, managers, leads, workers]);

  const workerGroups = useMemo(() => processes.map(process => {
    const assigned = workers.filter(worker => processIds(worker.process_ids).includes(process.id));
    return { process, total: assigned.length, active: assigned.filter(worker => worker.status === "active").length };
  }), [processes, workers]);

  const processCapacity = useMemo<ProcessCapacity[]>(() => processes.map(process => {
    const managersForProcess = managers.filter(person => processIds(person.process_ids).includes(process.id));
    const leadsForProcess = leads.filter(person => processIds(person.process_ids).includes(process.id));
    return {
      ...process,
      managers: managersForProcess,
      leads: leadsForProcess,
      managerCount: managersForProcess.filter(person => person.status === "active").length,
      leadCount: leadsForProcess.filter(person => person.status === "active").length
    };
  }), [processes, managers, leads]);

  const create = (role:Role) => setModal({ ...emptyForm, role, position: role === "worker" ? "Công nhân" : role === "lead" ? "Tổ trưởng" : "Quản lý" });

  const edit = (person:Person) => setModal({
    id: person.id, role: person.role, username: person.username || "", password: "", full_name: person.full_name || "",
    worker_code: person.worker_code || "", phone: person.phone || "", department: person.department || "Sản xuất",
    position: person.position || roleText(person.role), training_percent: String(person.training_percent ?? 100),
    process_ids: processIds(person.process_ids), status: person.status === "inactive" ? "inactive" : "active"
  });

  const save = async () => {
    if (!modal) return;
    setSaving(true);
    try {
      const body:any = { username: modal.username, full_name: modal.full_name, status: modal.status, process_ids: modal.process_ids, role: modal.role, department: modal.department, position: modal.position };
      if (modal.password) body.password = modal.password;
      if (modal.role === "worker") { body.training_percent = Number(modal.training_percent); body.worker_code = modal.worker_code; body.phone = modal.phone; }
      if (modal.id) await api.put(`/users/${modal.id}`, body);
      else await api.post("/users", { ...body, password: modal.password });
      showToast(modal.id ? "Đã cập nhật tài khoản" : "Đã tạo tài khoản", "success");
      setModal(null);
      await load();
    } catch (error:any) {
      showToast(error?.response?.data?.message || "Không thể lưu tài khoản", "error");
    } finally { setSaving(false); }
  };

  const promoteWorkerToLead = async (person:Person) => {
    if (!canEdit || person.role !== "worker" || promotingId !== null) return;
    const processText = person.process_names || "công đoạn đã được phân công";
    const confirmed = window.confirm(
      `Nâng ${person.full_name || person.username} (${person.worker_code || person.username}) lên Tổ trưởng?\n\n` +
      `• Giữ nguyên tài khoản và lịch sử dữ liệu\n` +
      `• Chuyển công đoạn hiện tại sang phụ trách Tổ trưởng\n` +
      `• Mật khẩu mới: 123456\n` +
      `• Công đoạn: ${processText}\n\n` +
      `Tiếp tục?`
    );
    if (!confirmed) return;
    setPromotingId(person.id);
    try {
      const response = await api.post(`/users/${person.id}/promote-lead`);
      showToast(response.data?.message || `Đã nâng ${person.full_name || person.username} lên Tổ trưởng`, "success");
      await load();
    } catch (error:any) {
      showToast(error?.response?.data?.message || "Không thể nâng công nhân lên Tổ trưởng", "error");
    } finally {
      setPromotingId(null);
    }
  };

  const remove = async (person:Person) => {
    if (!canEdit) return;
    if (!window.confirm(`Vô hiệu hóa tài khoản ${person.full_name}? Lịch sử dữ liệu sẽ được giữ nguyên.`)) return;
    try { await api.put(`/users/${person.id}`, { status: "inactive" }); showToast("Đã vô hiệu hóa tài khoản", "success"); await load(); }
    catch (error:any) { showToast(error?.response?.data?.message || "Không thể cập nhật tài khoản", "error"); }
  };

  const exportExcel = async () => {
    setTransferBusy(true); setTransferMessage("");
    try {
      const response = await api.get("/users/export/excel", { responseType: "blob" });
      const blob = new Blob([response.data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
      anchor.href = url; anchor.download = `KTC_TaiKhoanNhanSu_${new Date().toISOString().slice(0,10)}.xlsx`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url); setTransferMessage("Đã xuất danh sách tài khoản.");
    } catch (error:any) { setTransferMessage(error?.response?.data?.message || "Không thể xuất Excel."); }
    finally { setTransferBusy(false); }
  };

  const handleImport = async (file:File | null) => {
    if (!file) return;
    if (!/\.xlsx$/i.test(file.name)) { setTransferMessage("Chỉ hỗ trợ file Excel .xlsx."); return; }
    setTransferBusy(true); setTransferMessage("");
    try {
      const base64 = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || "")); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); });
      const response = await api.post("/users/import/excel", { file_base64: base64 });
      setTransferMessage(response.data?.message || "Đã nhập Excel."); await load();
    } catch (error:any) { setTransferMessage(error?.response?.data?.message || "Không thể nhập Excel."); }
    finally { setTransferBusy(false); if (fileInputRef.current) fileInputRef.current.value = ""; }
  };

  return (
    <section className="admin-personnel-page">
      <header className="admin-personnel-header">
        <div><div className="admin-eyebrow">QUẢN TRỊ TÀI KHOẢN</div><h1>Tài khoản & nhân sự</h1><p>Admin quản lý toàn bộ quản lý, tổ trưởng và công nhân; giới hạn nhân sự được áp dụng theo từng công đoạn.</p></div>
        <div className="admin-personnel-actions">{canCreate && <><button className="admin-btn primary" onClick={() => create("manager")}><Plus size={16}/> Tạo quản lý</button><button className="admin-btn secondary" onClick={() => create("lead")}><Plus size={16}/> Tạo tổ trưởng</button><button className="admin-btn secondary" onClick={() => create("worker")}><Plus size={16}/> Tạo công nhân</button></>}</div>
      </header>
      <div className="admin-personnel-tabs">{[["overview","Tổng quan"],["manager","Quản lý"],["lead","Tổ trưởng"],["worker","Công nhân"],["activity","Nhật ký hoạt động"]].map(([key,label]) => <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key as Tab)}>{label}</button>)}</div>
      <div className="admin-personnel-toolbar"><div className="admin-search"><Search size={17}/><input value={keyword} onChange={event => setKeyword(event.target.value)} placeholder="Tìm tên, tài khoản, mã công nhân, công đoạn..."/></div><div className="admin-transfer"><button className="admin-btn secondary" disabled={transferBusy} onClick={() => void exportExcel()}><Download size={15}/> Xuất Excel</button><button className="admin-btn primary" disabled={transferBusy || !canCreate} onClick={() => fileInputRef.current?.click()}><Upload size={15}/> Nhập Excel</button><input ref={fileInputRef} type="file" accept=".xlsx" hidden onChange={event => void handleImport(event.target.files?.[0] || null)}/></div></div>
      {transferMessage && <div className={`admin-transfer-message ${transferMessage.toLowerCase().includes("không") ? "error" : "success"}`}><FileSpreadsheet size={15}/>{transferMessage}</div>}
      {loading ? <div className="admin-state">Đang tải dữ liệu tài khoản...</div> : tab === "overview" ? <Overview people={people} managers={managers} leads={leads} workers={workers} active={active} workerGroups={workerGroups} processCapacity={processCapacity} canEdit={canEdit} onEdit={edit} onDelete={remove} onPromote={promoteWorkerToLead} promotingId={promotingId} onTab={setTab}/> : tab === "activity" ? <section className="admin-card"><CardTitle title="Nhật ký hoạt động tài khoản" sub="Theo dõi đăng nhập và đăng xuất của tài khoản nhân sự"/>{activityLoading ? <div className="admin-state compact">Đang tải nhật ký...</div> : <Activity rows={activities}/>}</section> : <section className="admin-card"><CardTitle title={`${roleText(tab)} (${filtered.length})`} sub={`Danh sách toàn bộ tài khoản ${roleText(tab).toLowerCase()} trong hệ thống`}/><AccountTable rows={filtered} canEdit={canEdit} onEdit={edit} onDelete={remove} onPromote={promoteWorkerToLead} promotingId={promotingId}/></section>}
      {modal && <Modal form={modal} setForm={setModal} processes={processes} processCapacity={processCapacity} saving={saving} onClose={() => setModal(null)} onSave={() => void save()}/>} 
    </section>
  );
}

function Overview({ people, managers, leads, workers, active, workerGroups, processCapacity, canEdit, onEdit, onDelete, onPromote, promotingId, onTab }: { people:Person[]; managers:Person[]; leads:Person[]; workers:Person[]; active:Person[]; workerGroups:{process:Process;total:number;active:number}[]; processCapacity:ProcessCapacity[]; canEdit:boolean; onEdit:(p:Person)=>void; onDelete:(p:Person)=>void; onPromote:(p:Person)=>void; promotingId:number|null; onTab:(tab:Tab)=>void }) {
  const roleRows = [{ key:"manager" as const, label:"Quản lý", rows:managers }, { key:"lead" as const, label:"Tổ trưởng", rows:leads }, { key:"worker" as const, label:"Công nhân", rows:workers }];
  return <>
    <section className="admin-kpis"><Kpi icon={<Users/>} label="Tổng tài khoản" value={people.length} note={`${active.length} đang hoạt động`}/><Kpi icon={<ShieldCheck/>} label="Quản lý" value={managers.length} note="Không giới hạn tổng số · 1/công đoạn"/><Kpi icon={<Users/>} label="Tổ trưởng" value={leads.length} note="Không giới hạn tổng số · tối đa 3/công đoạn"/><Kpi icon={<UserRound/>} label="Công nhân" value={workers.length} note={`${workers.filter(x => x.status === "active").length} đang hoạt động`}/><div className="admin-health"><div><span className="health-dot"/> Hệ thống nhân sự</div><strong>{active.length}/{people.length}</strong><small>tài khoản đang hoạt động</small></div></section>
    <div className="admin-overview-grid">
      <section className="admin-card"><CardTitle title="Phân bổ tài khoản" sub="Admin không bị giới hạn tổng số quản lý hoặc tổ trưởng"/><div className="role-overview">{roleRows.map(item => <button key={item.key} onClick={() => onTab(item.key)}><span className={`role-icon ${item.key}`}><UserRound size={17}/></span><div><b>{item.label}</b><small>{item.rows.filter(x => x.status === "active").length} hoạt động · {item.rows.length} tổng</small></div><strong>{item.rows.length}</strong></button>)}</div></section>
      <section className="admin-card"><CardTitle title="Công nhân theo công đoạn" sub="Phân bổ nhân sự đang được gán công đoạn"/><div className="process-list">{workerGroups.map(item => <div key={item.process.id}><div><b>{item.process.process_name}</b><span>{item.active}/{item.total} hoạt động</span></div><div className="bar"><i style={{ width: `${item.total ? Math.min(100, item.active / item.total * 100) : 0}%` }}/></div></div>)}{workerGroups.length === 0 && <div className="admin-empty">Chưa có dữ liệu công đoạn.</div>}</div></section>
      <section className="admin-card wide"><CardTitle title="Định biên quản lý theo công đoạn" sub="Mỗi công đoạn có tối đa 1 quản lý và 3 tổ trưởng"/><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Công đoạn</th><th>Quản lý</th><th>Tổ trưởng</th><th>Trạng thái định biên</th></tr></thead><tbody>{processCapacity.length ? processCapacity.map(item => { const managerFull = item.managerCount >= 1; const leadFull = item.leadCount >= 3; return <tr key={item.id}><td><strong>{item.process_name}</strong>{item.process_code && <small>{item.process_code}</small>}</td><td><strong>{item.managerCount}/1</strong><small>{item.managers.filter(x => x.status === "active").map(x => x.full_name || x.username).join(", ") || "Chưa phân công"}</small></td><td><strong>{item.leadCount}/3</strong><small>{item.leads.filter(x => x.status === "active").map(x => x.full_name || x.username).join(", ") || "Chưa phân công"}</small></td><td><span className={`status-badge ${managerFull && leadFull ? "active" : "inactive"}`}>{managerFull && leadFull ? "Đã đủ định biên" : "Còn vị trí"}</span></td></tr>; }) : <tr><td colSpan={4} className="admin-empty">Chưa có dữ liệu công đoạn.</td></tr>}</tbody></table></div></section>
      <section className="admin-card wide"><CardTitle title="Tài khoản cập nhật gần đây" sub="Các tài khoản mới nhất trong hệ thống"/><AccountTable rows={[...people].sort((a,b) => String(b.created_at || "").localeCompare(String(a.created_at || ""))).slice(0,8)} canEdit={canEdit} onEdit={onEdit} onDelete={onDelete} onPromote={onPromote} promotingId={promotingId}/></section>
    </div>
  </>;
}

function Kpi({ icon, label, value, note }: { icon:ReactNode; label:string; value:number; note:string }) { return <div className="admin-kpi"><span>{icon}</span><small>{label}</small><strong>{value}</strong><em>{note}</em></div>; }
function CardTitle({ title, sub }: { title:string; sub:string }) { return <div className="admin-card-title"><div><h2>{title}</h2><p>{sub}</p></div></div>; }
function AccountTable({ rows, canEdit, onEdit, onDelete, onPromote, promotingId }: { rows:Person[]; canEdit:boolean; onEdit:(p:Person)=>void; onDelete:(p:Person)=>void; onPromote:(p:Person)=>void; promotingId:number|null }) { return <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Tài khoản</th><th>Họ và tên</th><th>Vai trò</th><th>Công đoạn / bộ phận</th><th>Trạng thái</th><th>Ngày tạo</th><th/></tr></thead><tbody>{rows.length ? rows.map(person => <tr key={person.id}><td><strong>{person.username}</strong>{person.worker_code && <small>{person.worker_code}</small>}</td><td>{person.full_name || "—"}</td><td><span className={`role-badge ${person.role}`}>{roleText(person.role)}</span></td><td><strong className="process-cell">{person.process_names || person.department || "Chưa gán"}</strong></td><td><span className={`status-badge ${person.status}`}>{statusText(person.status)}</span></td><td>{person.created_at ? new Date(person.created_at).toLocaleDateString("vi-VN") : "—"}</td><td>{canEdit && <div className="admin-row-actions"><button title="Sửa" onClick={() => onEdit(person)}><Pencil size={14}/></button>{person.role === "worker" && <button title="Nâng lên Tổ trưởng" onClick={() => void onPromote(person)} disabled={promotingId !== null}><ShieldCheck size={14}/></button>}<button className="danger" title="Vô hiệu hóa" onClick={() => void onDelete(person)} disabled={person.status !== "active"}><Trash2 size={14}/></button></div>}</td></tr>) : <tr><td colSpan={7} className="admin-empty">Không có tài khoản phù hợp.</td></tr>}</tbody></table></div>; }
function Activity({ rows }: { rows:ActivityItem[] }) { const filtered = rows.filter(row => ["LOGIN","LOGOUT"].includes(String(row.action || "").toUpperCase())); return <div className="admin-activity">{filtered.length ? filtered.map((row,index) => <div key={`${row.id || index}-${row.created_at}`}><span className={`activity-icon ${String(row.action).toUpperCase() === "LOGIN" ? "login" : "logout"}`}><History size={14}/></span><div><strong>{row.full_name || row.username || "Tài khoản"}</strong><p>{String(row.action).toUpperCase() === "LOGIN" ? "Đăng nhập hệ thống" : "Đăng xuất khỏi hệ thống"}</p></div><time>{row.created_at ? new Date(row.created_at).toLocaleString("vi-VN") : "—"}</time></div>) : <div className="admin-empty">Chưa có hoạt động đăng nhập/đăng xuất.</div>}</div>; }

function Modal({ form, setForm, processes, processCapacity, saving, onClose, onSave }: { form:FormState; setForm:(f:FormState)=>void; processes:Process[]; processCapacity:ProcessCapacity[]; saving:boolean; onClose:()=>void; onSave:()=>void }) {
  const isEditing = Boolean(form.id);
  const selectedIds = form.process_ids;
  const canAssignProcess = (process:Process) => {
    if (form.role === "worker") return true;
    const capacity = processCapacity.find(item => item.id === process.id);
    if (!capacity) return false;
    if (selectedIds.includes(process.id)) return true;
    if (form.role === "manager") return capacity.managerCount < 1;
    return capacity.leadCount < 3;
  };

  const toggleProcess = (processId:number, checked:boolean) => setForm({ ...form, process_ids: checked ? [...form.process_ids, processId] : form.process_ids.filter(id => id !== processId) });

  return <div className="admin-modal-backdrop"><div className="admin-modal"><div className="admin-modal-head"><div><span>QUẢN TRỊ TÀI KHOẢN</span><h2>{isEditing ? "Chỉnh sửa" : "Tạo"} {roleText(form.role)}</h2><p>{form.role === "manager" ? "Admin không giới hạn tổng số quản lý; mỗi công đoạn tối đa 1 quản lý." : form.role === "lead" ? "Admin không giới hạn tổng số tổ trưởng; mỗi công đoạn tối đa 3 tổ trưởng." : "Thông tin tài khoản được lưu trực tiếp vào hệ thống."}</p></div><button onClick={onClose}><X size={18}/></button></div><div className="admin-modal-grid"><label>Vai trò<select value={form.role} disabled={isEditing} onChange={event => { const role = event.target.value as Role; setForm({...form, role, position: role === "worker" ? "Công nhân" : role === "lead" ? "Tổ trưởng" : "Quản lý", process_ids:[]}); }}><option value="manager">Quản lý</option><option value="lead">Tổ trưởng</option><option value="worker">Công nhân</option></select></label><label>Trạng thái<select value={form.status} onChange={event => setForm({...form, status:event.target.value as "active"|"inactive"})}><option value="active">Đang hoạt động</option><option value="inactive">Ngừng hoạt động</option></select></label><label>Họ và tên<input value={form.full_name} onChange={event => setForm({...form, full_name:event.target.value})}/></label><label>Tên đăng nhập<input value={form.username} onChange={event => setForm({...form, username:event.target.value})}/></label><label>Mật khẩu{form.id && <small> (để trống nếu không đổi)</small>}<input type="password" value={form.password} onChange={event => setForm({...form, password:event.target.value})} placeholder="Tối thiểu 6 ký tự"/></label>{form.role === "worker" && <><label>Mã công nhân<input value={form.worker_code} onChange={event => setForm({...form, worker_code:event.target.value})}/></label><label>Số điện thoại<input value={form.phone} onChange={event => setForm({...form, phone:event.target.value})}/></label><label>% học việc<input type="number" min="0" max="100" value={form.training_percent} onChange={event => setForm({...form, training_percent:event.target.value})}/></label></>}<label>Bộ phận / đơn vị<input value={form.department} onChange={event => setForm({...form, department:event.target.value})}/></label><label>Chức danh<input value={form.position} onChange={event => setForm({...form, position:event.target.value})}/></label><div className="admin-process-select"><span>Công đoạn phụ trách</span><div>{processes.map(process => { const capacity = processCapacity.find(item => item.id === process.id); const selected = selectedIds.includes(process.id); const full = form.role === "manager" ? (capacity?.managerCount || 0) >= 1 : form.role === "lead" ? (capacity?.leadCount || 0) >= 3 : false; const disabled = !canAssignProcess(process); return <label key={process.id} title={form.role === "manager" ? `Quản lý: ${capacity?.managerCount || 0}/1` : form.role === "lead" ? `Tổ trưởng: ${capacity?.leadCount || 0}/3` : "Không giới hạn"}><input type="checkbox" checked={selected} disabled={disabled} onChange={event => toggleProcess(process.id, event.target.checked)}/><span>{process.process_name}{form.role !== "worker" && <small> ({form.role === "manager" ? `${capacity?.managerCount || 0}/1` : `${capacity?.leadCount || 0}/3`}{full && !selected ? " · đủ" : ""})</small>}</span></label>; })}</div></div></div><div className="admin-modal-actions"><button onClick={onClose}>Hủy</button><button className="admin-btn primary" disabled={saving} onClick={onSave}>{saving ? "Đang lưu..." : "Lưu tài khoản"}</button></div></div></div>;
}
