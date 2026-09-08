import { useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  FileSpreadsheet,
  LogIn,
  LogOut,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import api from "../../services/api";
import { getActivities, type ActivityItem } from "../../services/systemService";
import { useToast } from "../../components/feedback/toastContext";
import { usePermissions } from "../../hooks/usePermissions";
import "./Workers.css";

type Person = {
  id: number;
  username: string;
  full_name: string;
  role: "manager" | "lead" | "worker";
  status: string;
  worker_code?: string | null;
  phone?: string | null;
  department?: string | null;
  position?: string | null;
  training_percent?: number;
  process_ids?: string | null;
  process_names?: string | null;
};

type Process = { id: number; process_name: string; process_code?: string };

type FormState = {
  id?: number;
  role: "lead" | "worker";
  username: string;
  password: string;
  full_name: string;
  worker_code: string;
  phone: string;
  department: string;
  position: string;
  training_percent: string;
  process_ids: number[];
  status: "active" | "inactive";
};

const emptyForm: FormState = {
  role: "lead",
  username: "",
  password: "",
  full_name: "",
  worker_code: "",
  phone: "",
  department: "Sản xuất",
  position: "Tổ trưởng",
  training_percent: "100",
  process_ids: [],
  status: "active",
};

const roleText = (role: string) =>
  role === "lead" ? "Tổ trưởng" : role === "worker" ? "Công nhân" : "Quản lý";

const statusText = (status: string) =>
  status === "active" ? "Đang hoạt động" : "Ngừng hoạt động";

const processIds = (value?: string | null) =>
  String(value || "")
    .split(",")
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0);

const activityAction = (action: string) =>
  String(action || "").toUpperCase() === "LOGOUT" ? "Đăng xuất" : "Đăng nhập";

export default function Workers() {
  const { can } = usePermissions();
  const { showToast } = useToast();
  const canCreate = can("USER_CREATE");
  const canEdit = can("USER_EDIT");

  const [people, setPeople] = useState<Person[]>([]);
  const [processes, setProcesses] = useState<Process[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activityLoading, setActivityLoading] = useState(false);
  const [tab, setTab] = useState<"all" | "lead" | "worker" | "activity">("all");
  const [keyword, setKeyword] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "lead" | "worker">("all");
  const [processFilter, setProcessFilter] = useState("all");
  const [modal, setModal] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [promotingId, setPromotingId] = useState<number | null>(null);
  const [transferBusy, setTransferBusy] = useState(false);
  const [transferMessage, setTransferMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [usersResponse, processesResponse] = await Promise.all([
        api.get("/users"),
        api.get("/users/options/processes"),
      ]);
      setPeople(usersResponse.data?.data || []);
      setProcesses(processesResponse.data?.data || []);
    } catch {
      showToast("Không thể tải dữ liệu nhân sự", "error");
    } finally {
      setLoading(false);
    }
  };

  const loadActivities = async () => {
    setActivityLoading(true);
    try {
      const rows = await getActivities({ limit: 100 });
      setActivities(
        rows.filter((row) =>
          ["LOGIN", "LOGOUT"].includes(String(row.action || "").toUpperCase()),
        ),
      );
    } catch {
      showToast("Không thể tải lịch sử đăng nhập/đăng xuất", "error");
    } finally {
      setActivityLoading(false);
    }
  };

  useEffect(() => void load(), []);
  useEffect(() => {
    if (tab === "activity") void loadActivities();
  }, [tab]);

  const leads = useMemo(() => people.filter((p) => p.role === "lead"), [people]);
  const workers = useMemo(() => people.filter((p) => p.role === "worker"), [people]);

  const filteredPeople = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    return people.filter((person) => {
      if (person.role === "manager") return false;
      if (tab === "lead" && person.role !== "lead") return false;
      if (tab === "worker" && person.role !== "worker") return false;
      if (roleFilter !== "all" && person.role !== roleFilter) return false;
      if (processFilter !== "all" && !processIds(person.process_ids).includes(Number(processFilter))) return false;
      if (!query) return true;
      return [
        person.username,
        person.full_name,
        person.worker_code,
        person.phone,
        person.process_names,
        person.department,
      ].join(" ").toLowerCase().includes(query);
    });
  }, [people, keyword, tab, roleFilter, processFilter]);

  const create = (role: "lead" | "worker") =>
    setModal({ ...emptyForm, role, position: role === "worker" ? "Công nhân" : "Tổ trưởng" });

  const edit = (person: Person) =>
    setModal({
      id: person.id,
      role: person.role === "lead" ? "lead" : "worker",
      username: person.username || "",
      password: "",
      full_name: person.full_name || "",
      worker_code: person.worker_code || "",
      phone: person.phone || "",
      department: person.department || "Sản xuất",
      position: person.position || roleText(person.role),
      training_percent: String(person.training_percent ?? 100),
      process_ids: processIds(person.process_ids),
      status: person.status === "inactive" ? "inactive" : "active",
    });

  const save = async () => {
    if (!modal) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        username: modal.username,
        full_name: modal.full_name,
        status: modal.status,
        process_ids: modal.process_ids,
      };
      if (modal.password) body.password = modal.password;
      if (modal.role === "worker") {
        Object.assign(body, {
          worker_code: modal.worker_code,
          phone: modal.phone,
          department: modal.department,
          position: modal.position,
          training_percent: Number(modal.training_percent),
        });
      }
      if (modal.id) await api.put(`/users/${modal.id}`, body);
      else {
        body.role = modal.role;
        body.password = modal.role === "worker" ? crypto.randomUUID() : modal.password;
        await api.post("/users", body);
      }
      showToast(modal.id ? "Đã cập nhật nhân sự" : "Đã thêm nhân sự", "success");
      setModal(null);
      await load();
    } catch (error: any) {
      showToast(error?.response?.data?.message || "Không thể lưu nhân sự", "error");
    } finally {
      setSaving(false);
    }
  };

  const promoteWorkerToLead = async (person: Person) => {
    if (!canEdit || person.role !== "worker" || promotingId !== null) return;
    if (!window.confirm(`Nâng ${person.full_name || person.username} lên Tổ trưởng?\n\nGiữ nguyên tài khoản, lịch sử báo cáo và toàn bộ công đoạn hiện tại.`)) return;
    setPromotingId(person.id);
    try {
      const response = await api.post(`/users/${person.id}/promote-lead`);
      showToast(response.data?.message || "Đã nâng lên Tổ trưởng", "success");
      setModal(null);
      await load();
    } catch (error: any) {
      showToast(error?.response?.data?.message || "Không thể nâng công nhân lên Tổ trưởng", "error");
    } finally {
      setPromotingId(null);
    }
  };

  const remove = async (person: Person) => {
    if (!canEdit || !window.confirm(`Xóa ${roleText(person.role)} ${person.full_name}? Tài khoản sẽ chuyển sang Ngừng hoạt động.`)) return;
    try {
      await api.put(`/users/${person.id}`, { status: "inactive" });
      showToast("Đã chuyển nhân sự sang Ngừng hoạt động", "success");
      await load();
    } catch (error: any) {
      showToast(error?.response?.data?.message || "Không thể xóa nhân sự", "error");
    }
  };

  const exportExcel = async () => {
    setTransferBusy(true);
    setTransferMessage("");
    try {
      const response = await api.get("/users/export/excel", { responseType: "blob" });
      const blob = new Blob([response.data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `KTC_NhanSu_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setTransferMessage("Đã xuất dữ liệu nhân sự.");
    } catch (error: any) {
      setTransferMessage(error?.response?.data?.message || "Không thể xuất Excel nhân sự.");
    } finally {
      setTransferBusy(false);
    }
  };

  const handleImportFile = async (file: File | null) => {
    if (!file) return;
    if (!/\.xlsx$/i.test(file.name)) {
      setTransferMessage("Chỉ hỗ trợ file Excel .xlsx.");
      return;
    }
    setTransferBusy(true);
    setTransferMessage("");
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(reader.error || new Error("Không đọc được file"));
        reader.readAsDataURL(file);
      });
      const response = await api.post("/users/import/excel", { file_base64: base64 });
      setTransferMessage(response.data?.message || "Đã nhập Excel nhân sự.");
      await load();
    } catch (error: any) {
      const data = error?.response?.data;
      setTransferMessage(data?.errors?.length ? `${data.message || "File không hợp lệ"} ${data.errors.slice(0, 2).join("; ")}` : data?.message || "Không thể nhập Excel nhân sự.");
    } finally {
      setTransferBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <section className="personnel-page manager-page">
      <header className="personnel-header">
        <div>
          <h1>Nhân sự</h1>
          <p>Quản lý tổ trưởng, công nhân và phân công công đoạn</p>
        </div>
        {canCreate && (
          <div className="personnel-header-actions">
            <button className="personnel-primary" onClick={() => create("lead")}><Plus size={15} /> Tổ trưởng</button>
            <button className="personnel-secondary" onClick={() => create("worker")}><Plus size={15} /> Công nhân</button>
          </div>
        )}
      </header>

      <nav className="personnel-tabs">
        <button className={tab === "all" ? "active" : ""} onClick={() => { setTab("all"); setRoleFilter("all"); }}>Tất cả ({leads.length + workers.length})</button>
        <button className={tab === "lead" ? "active" : ""} onClick={() => { setTab("lead"); setRoleFilter("lead"); }}>Tổ trưởng ({leads.length})</button>
        <button className={tab === "worker" ? "active" : ""} onClick={() => { setTab("worker"); setRoleFilter("worker"); }}>Công nhân ({workers.length})</button>
        <button className={tab === "activity" ? "active" : ""} onClick={() => setTab("activity")}>Lịch sử</button>
      </nav>

      {tab !== "activity" ? (
        <>
          <div className="personnel-summary">
            <span><Users size={15} /> <b>{leads.length + workers.length}</b> nhân sự</span>
            <i />
            <span>{workers.length} công nhân</span>
            <i />
            <span>{leads.length} tổ trưởng</span>
            <i />
            <span>{processes.length} công đoạn</span>
          </div>

          <div className="personnel-toolbar">
            <div className="personnel-search"><Search size={16} /><input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Tìm tên hoặc mã nhân sự..." /></div>
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as "all" | "lead" | "worker")}>
              <option value="all">Tất cả vai trò</option>
              <option value="lead">Tổ trưởng</option>
              <option value="worker">Công nhân</option>
            </select>
            <select value={processFilter} onChange={(e) => setProcessFilter(e.target.value)}>
              <option value="all">Tất cả công đoạn</option>
              {processes.map((process) => <option key={process.id} value={process.id}>{process.process_name}</option>)}
            </select>
            <button className="personnel-secondary" disabled={transferBusy} onClick={() => void exportExcel()}><Download size={15} /> Xuất Excel</button>
            {canCreate && <button className="personnel-primary" disabled={transferBusy} onClick={() => fileInputRef.current?.click()}><Upload size={15} /> Nhập Excel</button>}
            <input ref={fileInputRef} type="file" accept=".xlsx" hidden onChange={(e) => void handleImportFile(e.target.files?.[0] || null)} />
          </div>

          {transferMessage && <div className={`personnel-transfer-message ${transferMessage.toLowerCase().includes("không") ? "error" : "success"}`}><FileSpreadsheet size={14} /> {transferMessage}</div>}

          {loading ? <div className="personnel-state">Đang tải dữ liệu nhân sự...</div> : <section className="personnel-card personnel-directory-card">
            <div className="card-head"><div><h2>{tab === "lead" ? `Tổ trưởng (${filteredPeople.length})` : tab === "worker" ? `Công nhân (${filteredPeople.length})` : `Danh sách nhân sự (${filteredPeople.length})`}</h2><p>Danh sách được phân quyền theo các công đoạn quản lý phụ trách</p></div></div>
            <PersonTable rows={filteredPeople} canEdit={canEdit} onEdit={edit} onDelete={remove} onPromote={promoteWorkerToLead} promotingId={promotingId} />
          </section>}
        </>
      ) : (
        <section className="personnel-card personnel-directory-card">
          <div className="card-head"><div><h2>Lịch sử đăng nhập / đăng xuất</h2><p>Nhật ký phiên làm việc của tài khoản nhân sự</p></div></div>
          {activityLoading ? <div className="personnel-state compact">Đang tải lịch sử...</div> : <Activity rows={activities} />}
        </section>
      )}

      {modal && <div className="personnel-modal-backdrop"><div className="personnel-modal">
        <div className="modal-head"><div><h2>{modal.id ? "Sửa" : "Thêm"} {roleText(modal.role)}</h2></div><button type="button" onClick={() => setModal(null)}><X size={18} /></button></div>
        <div className="modal-grid">
          <label>Họ và tên<input value={modal.full_name} onChange={(e) => setModal({ ...modal, full_name: e.target.value })} /></label>
          <label>Tên đăng nhập<input value={modal.username} onChange={(e) => setModal({ ...modal, username: e.target.value })} /></label>
          {modal.role === "lead" && <label>Mật khẩu{modal.id && <small> (để trống nếu không đổi)</small>}<input type="password" value={modal.password} onChange={(e) => setModal({ ...modal, password: e.target.value })} /></label>}
          {modal.role === "worker" && <>
            <label>Mã công nhân<input value={modal.worker_code} onChange={(e) => setModal({ ...modal, worker_code: e.target.value })} /></label>
            <label>Số điện thoại<input value={modal.phone} onChange={(e) => setModal({ ...modal, phone: e.target.value })} /></label>
            <label>Bộ phận<input value={modal.department} onChange={(e) => setModal({ ...modal, department: e.target.value })} /></label>
            <label>Vị trí<input value={modal.position} onChange={(e) => setModal({ ...modal, position: e.target.value })} /></label>
            <label>% học việc<input type="number" min="0" max="100" value={modal.training_percent} onChange={(e) => setModal({ ...modal, training_percent: e.target.value })} /></label>
          </>}
          <label>Trạng thái<select value={modal.status} onChange={(e) => setModal({ ...modal, status: e.target.value as "active" | "inactive" })}><option value="active">Đang hoạt động</option><option value="inactive">Ngừng hoạt động</option></select></label>
          <div className="modal-processes"><span>Công đoạn phụ trách</span><div>{processes.map((process) => <label key={process.id}><input type="checkbox" checked={modal.process_ids.includes(process.id)} onChange={(e) => setModal({ ...modal, process_ids: e.target.checked ? [...modal.process_ids, process.id] : modal.process_ids.filter((id) => id !== process.id) })} />{process.process_name}</label>)}</div></div>
        </div>
        <div className="modal-actions">
          {modal.role === "worker" && modal.id && canEdit && <button type="button" className="personnel-secondary" disabled={saving || promotingId !== null} onClick={() => { const person = people.find((p) => p.id === modal.id); if (person) void promoteWorkerToLead(person); }}><ShieldCheck size={15} /> {promotingId === modal.id ? "Đang nâng..." : "Nâng lên Tổ trưởng"}</button>}
          <button type="button" onClick={() => setModal(null)}>Hủy</button>
          <button type="button" className="personnel-primary" disabled={saving || promotingId !== null} onClick={() => void save()}>{saving ? "Đang lưu..." : "Lưu thay đổi"}</button>
        </div>
      </div></div>}
    </section>
  );
}

function PersonTable({ rows, canEdit, onEdit, onDelete, onPromote, promotingId }: { rows: Person[]; canEdit: boolean; onEdit: (p: Person) => void; onDelete: (p: Person) => void; onPromote: (p: Person) => void; promotingId: number | null }) {
  return <div className="personnel-table-wrap"><table className="personnel-table"><thead><tr><th>#</th><th>Nhân sự</th><th>Mã</th><th>Vai trò</th><th>Công đoạn phụ trách</th><th>% học việc</th><th>SĐT</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>
    {rows.length ? rows.map((person, index) => <tr key={person.id}>
      <td>{index + 1}</td>
      <td><strong>{person.full_name || "—"}</strong><small>{person.username}</small></td>
      <td>{person.worker_code || "—"}</td>
      <td><span className={`role-pill ${person.role}`}>{roleText(person.role)}</span></td>
      <td className="process-cell">{person.process_names || "Chưa phân công"}</td>
      <td>{person.role === "worker" ? <span className={`training-pill ${Number(person.training_percent ?? 100) >= 100 ? "complete" : "learning"}`}>{Number(person.training_percent ?? 100)}%</span> : "—"}</td>
      <td>{person.phone || "—"}</td>
      <td><span className={`person-status ${person.status}`}>{statusText(person.status)}</span></td>
      <td><div className="row-actions">{canEdit && <><button type="button" title="Sửa" onClick={() => onEdit(person)} disabled={promotingId !== null}><Pencil size={14} /></button>{person.role === "worker" && <button type="button" title="Nâng lên Tổ trưởng" onClick={() => void onPromote(person)} disabled={promotingId !== null}><ShieldCheck size={14} /></button>}<button type="button" className="danger" title="Xóa" onClick={() => void onDelete(person)} disabled={promotingId !== null}><Trash2 size={14} /></button></>}</div></td>
    </tr>) : <tr><td colSpan={9} className="empty">Không có dữ liệu</td></tr>}
  </tbody></table></div>;
}

function Activity({ rows }: { rows: ActivityItem[] }) {
  return <div className="activity-list">{rows.length ? rows.map((item, index) => { const logout = String(item.action || "").toUpperCase() === "LOGOUT"; return <div key={`${item.id}-${index}`}><span className={`activity-dot ${logout ? "logout" : "login"}`}>{logout ? <LogOut size={13} /> : <LogIn size={13} />}</span><div><strong>{item.full_name || item.username || "Tài khoản"}</strong><p>{activityAction(item.action)} · {roleText(item.role || "")}{item.ip_address ? ` · ${item.ip_address}` : ""}</p></div><time>{item.created_at ? new Date(item.created_at).toLocaleString("vi-VN") : "—"}</time></div>; }) : <div className="activity-empty">Chưa có lịch sử đăng nhập / đăng xuất</div>}</div>;
}
