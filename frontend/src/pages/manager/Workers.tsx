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
  UserRound,
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
  created_at?: string;
};

type Process = {
  id: number;
  process_name: string;
  process_code?: string;
};

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
  const [tab, setTab] = useState("overview");
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

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (tab === "activity") void loadActivities();
  }, [tab]);

  const leads = useMemo(
    () => people.filter((person) => person.role === "lead"),
    [people],
  );
  const workers = useMemo(
    () => people.filter((person) => person.role === "worker"),
    [people],
  );

  const filter = (rows: Person[]) => {
    const query = keyword.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((person) =>
      [
        person.username,
        person.full_name,
        person.worker_code,
        person.phone,
        person.process_names,
        person.department,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  };

  const workerGroups = useMemo(
    () =>
      processes.map((process) => ({
        process,
        workers: workers.filter((worker) =>
          processIds(worker.process_ids).includes(process.id),
        ),
      })),
    [processes, workers],
  );

  const create = (role: "lead" | "worker") =>
    setModal({
      ...emptyForm,
      role,
      position: role === "worker" ? "Công nhân" : "Tổ trưởng",
    });

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

      if (modal.id) {
        await api.put(`/users/${modal.id}`, body);
      } else {
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

    const processText = person.process_names || "công đoạn đã được phân công";
    const confirmed = window.confirm(
      [
        `Nâng ${person.full_name || person.username} (${person.worker_code || person.username}) lên Tổ trưởng?`,
        "",
        "• Giữ nguyên tài khoản và lịch sử báo cáo",
        "• Chuyển toàn bộ công đoạn hiện tại sang Tổ trưởng",
        "• Mật khẩu sau khi nâng: 123456",
        `• Công đoạn: ${processText}`,
        "",
        "Quản lý chỉ được nâng công nhân thuộc công đoạn mình phụ trách.",
        "",
        "Tiếp tục?",
      ].join("\n"),
    );

    if (!confirmed) return;

    setPromotingId(person.id);
    try {
      const response = await api.post(`/users/${person.id}/promote-lead`);
      showToast(
        response.data?.message ||
          `Đã nâng ${person.full_name || person.username} lên Tổ trưởng`,
        "success",
      );
      setModal(null);
      await load();
    } catch (error: any) {
      showToast(
        error?.response?.data?.message ||
          "Không thể nâng công nhân lên Tổ trưởng",
        "error",
      );
    } finally {
      setPromotingId(null);
    }
  };

  const remove = async (person: Person) => {
    if (!canEdit) return;
    if (
      !window.confirm(
        `Xóa ${roleText(person.role)} ${person.full_name}? Tài khoản sẽ chuyển sang Ngừng hoạt động để bảo toàn lịch sử.`,
      )
    ) {
      return;
    }

    try {
      await api.put(`/users/${person.id}`, { status: "inactive" });
      showToast("Đã xóa khỏi danh sách hoạt động", "success");
      await load();
    } catch (error: any) {
      showToast(
        error?.response?.data?.message || "Không thể xóa nhân sự",
        "error",
      );
    }
  };

  const exportExcel = async () => {
    setTransferBusy(true);
    setTransferMessage("");
    try {
      const response = await api.get("/users/export/excel", {
        responseType: "blob",
      });
      const blob = new Blob([response.data], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
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
      setTransferMessage(
        error?.response?.data?.message || "Không thể xuất Excel nhân sự.",
      );
    } finally {
      setTransferBusy(false);
    }
  };

  const importExcel = () => fileInputRef.current?.click();

  const handleImportFile = async (file: File | null) => {
    if (!file) return;
    if (!/\.xlsx$/i.test(file.name)) {
      setTransferMessage("Chỉ hỗ trợ file Excel .xlsx.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setTransferBusy(true);
    setTransferMessage("");
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () =>
          reject(reader.error || new Error("Không đọc được file"));
        reader.readAsDataURL(file);
      });
      const response = await api.post("/users/import/excel", {
        file_base64: base64,
      });
      setTransferMessage(response.data?.message || "Đã nhập Excel nhân sự.");
      await load();
    } catch (error: any) {
      const data = error?.response?.data;
      setTransferMessage(
        data?.errors?.length
          ? `${data.message || "File không hợp lệ"} ${data.errors
              .slice(0, 2)
              .join("; ")}`
          : data?.message || "Không thể nhập Excel nhân sự.",
      );
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
          <p>Quản lý nhân sự trong hệ thống: quản lý, tổ trưởng và công nhân</p>
        </div>
        {canCreate && (
          <div className="personnel-header-actions">
            <button className="personnel-primary" onClick={() => create("lead")}>
              <Plus size={17} /> Thêm tổ trưởng
            </button>
            <button
              className="personnel-secondary"
              onClick={() => create("worker")}
            >
              <Plus size={16} /> Thêm công nhân
            </button>
          </div>
        )}
      </header>

      <nav className="personnel-tabs">
        {[
          ["overview", "Tổng quan"],
          ["leads", "Quản lý tổ trưởng"],
          ["workers", "Danh sách công nhân"],
          ["activity", "Lịch sử hoạt động"],
        ].map(([key, title]) => (
          <button
            key={key}
            className={tab === key ? "active" : ""}
            onClick={() => setTab(key)}
          >
            {title}
          </button>
        ))}
      </nav>

      <div className="personnel-toolbar">
        <div className="personnel-search">
          <Search size={17} />
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="Tìm mã, tên, bộ phận..."
          />
        </div>
        <div className="personnel-transfer-actions">
          <button
            type="button"
            className="personnel-secondary"
            disabled={transferBusy}
            onClick={() => void exportExcel()}
          >
            <Download size={15} /> Xuất Excel
          </button>
          {canCreate && (
            <button
              type="button"
              className="personnel-primary"
              disabled={transferBusy}
              onClick={importExcel}
            >
              <Upload size={15} /> Nhập Excel
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            hidden
            onChange={(event) =>
              void handleImportFile(event.target.files?.[0] || null)
            }
          />
        </div>
      </div>

      {transferMessage && (
        <div
          className={`personnel-transfer-message ${
            transferMessage.toLowerCase().includes("không") ? "error" : "success"
          }`}
        >
          <FileSpreadsheet size={14} />
          <span>{transferMessage}</span>
        </div>
      )}

      {loading ? (
        <div className="personnel-state">Đang tải dữ liệu nhân sự...</div>
      ) : (
        <>
          {tab === "overview" && (
            <>
              <section className="personnel-kpis">
                <div>
                  <Users />
                  <span>Tài khoản quản lý</span>
                  <b>{people.filter((person) => person.role === "manager").length}</b>
                  <small>Quản lý</small>
                </div>
                <div>
                  <Users />
                  <span>Tổ trưởng</span>
                  <b>
                    {leads.filter((person) => person.status === "active").length} / 3
                  </b>
                  <small>Đã tạo tối đa</small>
                </div>
                <div>
                  <UserRound />
                  <span>Công nhân</span>
                  <b>
                    {workers.filter((person) => person.status === "active").length}
                  </b>
                  <small>Đang hoạt động</small>
                </div>
                <div>
                  <Users />
                  <span>Công đoạn phụ trách</span>
                  <b>{processes.length}</b>
                  <small>Tổng số</small>
                </div>
                <article>
                  <strong>Quy định nhân sự</strong>
                  <p>✓ Mỗi tài khoản quản lý được tạo tối đa 3 tổ trưởng.</p>
                  <p>✓ Tổ trưởng quản lý công nhân theo công đoạn được giao.</p>
                  <p>✓ Lịch sử đăng nhập/đăng xuất được lưu trong hệ thống.</p>
                </article>
              </section>

              <div className="personnel-grid">
                <section className="personnel-card">
                  <CardHead
                    title={`Tổ trưởng của bạn (${leads.length}/3)`}
                    sub="Danh sách tổ trưởng được tạo và quản lý"
                  />
                  <PersonTable
                    rows={filter(leads)}
                    canEdit={canEdit}
                    onEdit={edit}
                    onDelete={remove}
                    onPromote={promoteWorkerToLead}
                    promotingId={promotingId}
                    role="lead"
                  />
                </section>

                <section className="personnel-card">
                  <CardHead
                    title="Công nhân theo công đoạn"
                    sub="Tổng số công nhân theo công đoạn"
                  />
                  <WorkerProcessTable rows={workerGroups} />
                </section>

                <section className="personnel-card personnel-grid-wide">
                  <CardHead
                    title="Lịch sử đăng nhập / đăng xuất gần đây"
                    sub="Theo dõi các phiên đăng nhập của tài khoản nhân sự"
                  />
                  <Activity rows={activities.slice(0, 5)} />
                </section>
              </div>
            </>
          )}

          {tab === "leads" && (
            <section className="personnel-card">
              <CardHead
                title="Quản lý tổ trưởng"
                sub="Thêm, sửa, xóa tổ trưởng"
              />
              <PersonTable
                rows={filter(leads)}
                canEdit={canEdit}
                onEdit={edit}
                onDelete={remove}
                onPromote={promoteWorkerToLead}
                promotingId={promotingId}
                role="lead"
              />
            </section>
          )}

          {tab === "workers" && (
            <section className="personnel-card">
              <CardHead
                title={`Danh sách công nhân (${workers.length})`}
                sub="Quản lý thông tin tài khoản, học việc và công đoạn phụ trách"
              />
              <PersonTable
                rows={filter(workers)}
                canEdit={canEdit}
                onEdit={edit}
                onDelete={remove}
                onPromote={promoteWorkerToLead}
                promotingId={promotingId}
                role="worker"
              />
            </section>
          )}

          {tab === "activity" && (
            <section className="personnel-card">
              <CardHead
                title="Lịch sử đăng nhập / đăng xuất"
                sub="Nhật ký phiên đăng nhập của các tài khoản nhân sự"
              />
              {activityLoading ? (
                <div className="personnel-state compact">Đang tải lịch sử...</div>
              ) : (
                <Activity rows={activities} />
              )}
            </section>
          )}
        </>
      )}

      {modal && (
        <div className="personnel-modal-backdrop">
          <div className="personnel-modal">
            <div className="modal-head">
              <div>
                <h2>
                  {modal.id ? "Sửa" : "Thêm"} {roleText(modal.role)}
                </h2>
                <p>Thông tin được lưu trực tiếp vào hệ thống.</p>
              </div>
              <button type="button" onClick={() => setModal(null)}>
                <X size={19} />
              </button>
            </div>

            <div className="modal-grid">
              <label>
                Họ và tên
                <input
                  value={modal.full_name}
                  onChange={(event) =>
                    setModal({ ...modal, full_name: event.target.value })
                  }
                />
              </label>
              <label>
                Tên đăng nhập
                <input
                  value={modal.username}
                  onChange={(event) =>
                    setModal({ ...modal, username: event.target.value })
                  }
                />
              </label>

              {modal.role === "lead" && (
                <label>
                  Mật khẩu{modal.id && <small> (để trống nếu không đổi)</small>}
                  <input
                    type="password"
                    value={modal.password}
                    onChange={(event) =>
                      setModal({ ...modal, password: event.target.value })
                    }
                    placeholder="Tối thiểu 6 ký tự"
                  />
                </label>
              )}

              {modal.role === "worker" && (
                <>
                  <label>
                    Mã công nhân
                    <input
                      value={modal.worker_code}
                      onChange={(event) =>
                        setModal({ ...modal, worker_code: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Số điện thoại
                    <input
                      value={modal.phone}
                      onChange={(event) =>
                        setModal({ ...modal, phone: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Bộ phận
                    <input
                      value={modal.department}
                      onChange={(event) =>
                        setModal({ ...modal, department: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Vị trí
                    <input
                      value={modal.position}
                      onChange={(event) =>
                        setModal({ ...modal, position: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    % học việc
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={modal.training_percent}
                      onChange={(event) =>
                        setModal({
                          ...modal,
                          training_percent: event.target.value,
                        })
                      }
                    />
                  </label>
                </>
              )}

              <label>
                Trạng thái
                <select
                  value={modal.status}
                  onChange={(event) =>
                    setModal({
                      ...modal,
                      status: event.target.value as "active" | "inactive",
                    })
                  }
                >
                  <option value="active">Đang hoạt động</option>
                  <option value="inactive">Ngừng hoạt động</option>
                </select>
              </label>

              <div className="modal-processes">
                <span>Công đoạn phụ trách</span>
                <div>
                  {processes.map((process) => (
                    <label key={process.id}>
                      <input
                        type="checkbox"
                        checked={modal.process_ids.includes(process.id)}
                        onChange={(event) =>
                          setModal({
                            ...modal,
                            process_ids: event.target.checked
                              ? [...modal.process_ids, process.id]
                              : modal.process_ids.filter(
                                  (id) => id !== process.id,
                                ),
                          })
                        }
                      />
                      {process.process_name}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="modal-actions">
              {modal.role === "worker" && modal.id && canEdit && (
                <button
                  type="button"
                  className="personnel-secondary"
                  disabled={saving || promotingId !== null}
                  onClick={() => {
                    const person = people.find((item) => item.id === modal.id);
                    if (person) void promoteWorkerToLead(person);
                  }}
                >
                  <ShieldCheck size={16} />
                  {promotingId === modal.id
                    ? "Đang nâng..."
                    : "Nâng lên Tổ trưởng"}
                </button>
              )}
              <button type="button" onClick={() => setModal(null)}>
                Hủy
              </button>
              <button
                type="button"
                className="personnel-primary"
                disabled={saving || promotingId !== null}
                onClick={() => void save()}
              >
                {saving ? "Đang lưu..." : "Lưu thay đổi"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function CardHead({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="card-head">
      <div>
        <h2>{title}</h2>
        <p>{sub}</p>
      </div>
    </div>
  );
}

function PersonTable({
  rows,
  canEdit,
  onEdit,
  onDelete,
  onPromote,
  promotingId,
  role,
}: {
  rows: Person[];
  canEdit: boolean;
  onEdit: (person: Person) => void;
  onDelete: (person: Person) => void;
  onPromote: (person: Person) => void;
  promotingId: number | null;
  role: "lead" | "worker";
}) {
  const worker = role === "worker";

  return (
    <div className="personnel-table-wrap">
      <table className="personnel-table">
        <thead>
          <tr>
            <th>STT</th>
            <th>{worker ? "Công nhân" : "Tổ trưởng"}</th>
            <th>Mã</th>
            <th>Công đoạn phụ trách</th>
            {worker && <th>% học việc</th>}
            <th>Số điện thoại</th>
            <th>Trạng thái</th>
            <th>Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((person, index) => (
              <tr key={person.id}>
                <td>{index + 1}</td>
                <td>
                  <strong>{person.full_name}</strong>
                  <small>{person.username}</small>
                </td>
                <td>
                  {person.worker_code ||
                    `TT${String(index + 1).padStart(3, "0")}`}
                </td>
                <td>{person.process_names || "Chưa phân công"}</td>
                {worker && (
                  <td>
                    <span
                      className={`training-pill ${
                        Number(person.training_percent ?? 100) >= 100
                          ? "complete"
                          : "learning"
                      }`}
                    >
                      {Number(person.training_percent ?? 100)}%
                    </span>
                  </td>
                )}
                <td>{person.phone || "---"}</td>
                <td>
                  <span className={`person-status ${person.status}`}>
                    {statusText(person.status)}
                  </span>
                </td>
                <td>
                  <div className="row-actions">
                    {canEdit && (
                      <>
                        <button
                          type="button"
                          title="Sửa"
                          onClick={() => onEdit(person)}
                          disabled={promotingId !== null}
                        >
                          <Pencil size={15} />
                        </button>
                        {worker && (
                          <button
                            type="button"
                            className="promote"
                            title="Nâng lên Tổ trưởng"
                            onClick={() => void onPromote(person)}
                            disabled={promotingId !== null}
                          >
                            <ShieldCheck size={15} />
                          </button>
                        )}
                        <button
                          type="button"
                          className="danger"
                          title="Xóa"
                          onClick={() => void onDelete(person)}
                          disabled={promotingId !== null}
                        >
                          <Trash2 size={15} />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={worker ? 8 : 7} className="empty">
                Không có dữ liệu
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function WorkerProcessTable({
  rows,
}: {
  rows: { process: Process; workers: Person[] }[];
}) {
  return (
    <div className="personnel-table-wrap">
      <table className="personnel-table">
        <thead>
          <tr>
            <th>Công đoạn</th>
            <th>Số công nhân</th>
            <th>Đang hoạt động</th>
            <th>Trạng thái</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.process.id}>
              <td>
                <strong>{row.process.process_name}</strong>
              </td>
              <td>{row.workers.length}</td>
              <td>
                {row.workers.filter((worker) => worker.status === "active").length}
              </td>
              <td>
                <span className="person-status active">Đang theo dõi</span>
              </td>
            </tr>
          ))}
          <tr className="total-row">
            <td>Tổng cộng</td>
            <td>{rows.reduce((total, row) => total + row.workers.length, 0)}</td>
            <td>
              {rows.reduce(
                (total, row) =>
                  total +
                  row.workers.filter((worker) => worker.status === "active")
                    .length,
                0,
              )}
            </td>
            <td>—</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function Activity({ rows }: { rows: ActivityItem[] }) {
  return (
    <div className="activity-list">
      {rows.length ? (
        rows.map((item, index) => {
          const logout = String(item.action || "").toUpperCase() === "LOGOUT";
          return (
            <div key={`${item.id}-${index}`}>
              <span className={`activity-dot ${logout ? "logout" : "login"}`}>
                {logout ? <LogOut size={13} /> : <LogIn size={13} />}
              </span>
              <div>
                <strong>{item.full_name || item.username || "Tài khoản"}</strong>
                <p>
                  {activityAction(item.action)} · {roleText(item.role || "")}
                  {item.ip_address ? ` · ${item.ip_address}` : ""}
                </p>
              </div>
              <time>
                {item.created_at
                  ? new Date(item.created_at).toLocaleString("vi-VN")
                  : "—"}
              </time>
            </div>
          );
        })
      ) : (
        <div className="activity-empty">
          Chưa có lịch sử đăng nhập / đăng xuất
        </div>
      )}
    </div>
  );
}
