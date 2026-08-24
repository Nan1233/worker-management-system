import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { Archive, ArrowRight, Boxes, CheckCircle2, Database, Download, Factory, FileCog, HardDrive, Import, RefreshCw, Search, Settings2, Upload, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import api from "../../services/api";
import "./DataStandard.css";

type Resource = "processes" | "machines" | "standards" | "users" | "defects" | "deductions";
type Row = Record<string, unknown> & { id?: number; status?: string };

type Card = { key: Resource; title: string; description: string; icon: typeof Database; color: string; path: string };
const cards: Card[] = [
  { key: "standards", title: "Sản phẩm & định mức", description: "Mã sản phẩm và sản lượng chuẩn dùng để tính kết quả.", icon: Boxes, color: "blue", path: "standards" },
  { key: "machines", title: "Máy móc", description: "Danh sách máy và cấu hình theo từng công đoạn.", icon: HardDrive, color: "purple", path: "machines" },
  { key: "processes", title: "Công đoạn", description: "Các công đoạn sản xuất đang được hệ thống sử dụng.", icon: Factory, color: "orange", path: "processes" },
  { key: "users", title: "Công nhân", description: "Nhân sự, vai trò và phân công công đoạn.", icon: Users, color: "green", path: "users" },
  { key: "defects", title: "Loại lỗi", description: "Danh mục lỗi NG theo từng công đoạn.", icon: FileCog, color: "pink", path: "defects" },
  { key: "deductions", title: "Trừ giờ", description: "Danh mục lý do trừ giờ trong sản xuất.", icon: Settings2, color: "cyan", path: "deductions" },
];

const labels: Record<Resource, string> = { processes: "Công đoạn", machines: "Máy móc", standards: "Sản phẩm & định mức", users: "Công nhân", defects: "Loại lỗi", deductions: "Trừ giờ" };

function filenameFromDisposition(value: unknown, fallback: string) {
  const text = String(value || "");
  const match = text.match(/filename="?([^";]+)"?/i);
  return match?.[1] || fallback;
}

function DataStandard() {
  const navigate = useNavigate();
  const role = window.location.pathname.split("/")[1] || "manager";
  const inputRef = useRef<HTMLInputElement>(null);
  const [counts, setCounts] = useState<Record<Resource, number>>({ processes: 0, machines: 0, standards: 0, users: 0, defects: 0, deductions: 0 });
  const [selected, setSelected] = useState<Resource>("standards");
  const [rows, setRows] = useState<Row[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [transferBusy, setTransferBusy] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [lastImportAt, setLastImportAt] = useState<Date | null>(null);
  const [message, setMessage] = useState("");

  const load = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    const next = { ...counts };
    try {
      await Promise.all(cards.map(async card => {
        try {
          const endpoint = card.key === "users" ? "/users" : `/admin/master/${card.key}`;
          const response = await api.get(endpoint);
          const data = Array.isArray(response.data?.data) ? response.data.data : [];
          next[card.key] = data.length;
          if (card.key === selected) setRows(data);
        } catch { next[card.key] = 0; }
      }));
      setCounts(next);
      setUpdatedAt(new Date());
    } finally { if (showLoading) setLoading(false); }
  };

  const loadSelected = async (resource: Resource) => {
    try {
      const endpoint = resource === "users" ? "/users" : `/admin/master/${resource}`;
      const response = await api.get(endpoint);
      setRows(Array.isArray(response.data?.data) ? response.data.data : []);
    } catch { setRows([]); }
  };

  useEffect(() => { void load(); }, []);
  useEffect(() => { void loadSelected(selected); }, [selected]);

  const filteredRows = useMemo(() => rows.filter(row => JSON.stringify(row).toLowerCase().includes(query.toLowerCase())), [rows, query]);
  const selectedLabel = labels[selected];

  const openManager = (resource: Resource) => navigate(`/${role}/master/${resource}`);

  const downloadExcel = async (resource: Resource = selected) => {
    setTransferBusy(true); setMessage("");
    try {
      const response = await api.get(`/admin/master/transfer/export/${resource}`, { responseType: "blob" });
      const blob = new Blob([response.data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filenameFromDisposition(response.headers?.["content-disposition"], `KTC_MasterData_${resource}.xlsx`);
      document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
      setMessage(`Đã tải dữ liệu ${labels[resource]} về máy.`);
    } catch (error: any) {
      setMessage(error?.response?.data?.message || "Không thể tải dữ liệu.");
    } finally { setTransferBusy(false); }
  };

  const chooseImport = () => inputRef.current?.click();

  const importExcel = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!/\.xlsx$/i.test(file.name)) { setMessage("Chỉ hỗ trợ file Excel .xlsx."); return; }
    setTransferBusy(true); setMessage("");
    try {
      const buffer = await file.arrayBuffer();
      let binary = "";
      const bytes = new Uint8Array(buffer);
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
      const base64 = btoa(binary);
      const response = await api.post(`/admin/master/transfer/import/${selected}`, { file_base64: base64, file_name: file.name });
      setLastImportAt(new Date());
      setMessage(response.data?.message || "Đã nhập dữ liệu thành công.");
      await load(false); await loadSelected(selected);
    } catch (error: any) {
      setMessage(error?.response?.data?.message || "Không thể nhập dữ liệu. Kiểm tra lại file Excel.");
    } finally { setTransferBusy(false); }
  };

  return (
    <main className="data-standard-page manager-page">
      <input ref={inputRef} type="file" accept=".xlsx" hidden onChange={importExcel} />
      <header className="data-standard-heading">
        <div><span className="eyebrow">MASTER DATA</span><h1>Dữ liệu chuẩn</h1><p>Cấu hình dữ liệu đầu vào của hệ thống. Dữ liệu được lưu trực tiếp trong Database và có thể tải xuống hoặc nhập lại bằng Excel.</p></div>
        <div className="heading-actions"><button className="data-refresh" type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={16} className={loading ? "spin" : ""} /> Làm mới</button></div>
      </header>

      <section className="data-status-strip">
        <div className="status-main"><span className="status-icon"><Database size={21} /></span><div><strong>Trạng thái dữ liệu</strong><span>Dữ liệu chuẩn đang lấy trực tiếp từ Database</span></div><b><CheckCircle2 size={17} /> Đã kết nối</b></div>
        <div className="status-item"><span>Lần tải gần nhất</span><strong>{updatedAt ? updatedAt.toLocaleString("vi-VN") : "Đang tải..."}</strong><small>Dữ liệu hệ thống</small></div>
        <div className="status-item"><span>Lần nhập gần nhất</span><strong>{lastImportAt ? lastImportAt.toLocaleString("vi-VN") : "Chưa nhập"}</strong><small>Excel → Database</small></div>
        <div className="status-item"><span>Tổng nhóm dữ liệu</span><strong>06 nhóm</strong><small>{Object.values(counts).reduce((a,b) => a+b, 0).toLocaleString("vi-VN")} bản ghi</small></div>
        <div className="status-item"><span>Nguồn dữ liệu</span><strong>Database</strong><small>Excel chỉ dùng để trao đổi</small></div>
      </section>

      {message && <div className="data-message"><CheckCircle2 size={16} />{message}</div>}

      <div className="data-layout">
        <section className="data-main-card">
          <div className="section-head"><div><span className="section-kicker">CẤU HÌNH DỮ LIỆU</span><h2>Danh mục dữ liệu chuẩn</h2><p>Các danh mục không phụ thuộc Excel. Excel chỉ là định dạng tải xuống / nhập dữ liệu.</p></div></div>
          <div className="data-card-grid">
            {cards.map(card => { const Icon = card.icon; return <button key={card.key} type="button" className={`data-card ${card.color} ${selected === card.key ? "selected" : ""}`} onClick={() => setSelected(card.key)}><span className="data-card-icon"><Icon size={21} /></span><span className="data-card-copy"><strong>{card.title}</strong><small>{card.description}</small><b>{loading ? "..." : counts[card.key].toLocaleString("vi-VN")} bản ghi</b></span><ArrowRight size={18} /></button>; })}
          </div>

          <div className="data-table-head"><div><span className="section-kicker">DỮ LIỆU HIỆN TẠI</span><h2>{selectedLabel}</h2></div><div className="table-actions"><label><Search size={16} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Tìm kiếm..." /></label><button type="button" onClick={() => openManager(selected)}>Quản lý chi tiết</button></div></div>
          <div className="data-table-wrap"><table><thead><tr><th>ID</th><th>Mã / tên</th><th>Thông tin</th><th>Trạng thái</th></tr></thead><tbody>{filteredRows.slice(0, 10).map((row, index) => <tr key={String(row.id || index)}><td>{String(row.id ?? "—")}</td><td><strong>{String(row.product_code || row.process_code || row.machine_code || row.username || row.defect_code || row.deduction_code || row.full_name || "—")}</strong></td><td>{String(row.process_name || row.machine_name || row.full_name || row.defect_name || row.deduction_name || row.standard_output || row.description || "—")}</td><td><span className={`data-status ${row.status === "inactive" ? "off" : "on"}`}>{row.status === "inactive" ? "Ngừng dùng" : "Đang dùng"}</span></td></tr>)}{!loading && filteredRows.length === 0 && <tr><td colSpan={4} className="empty">Không có dữ liệu phù hợp.</td></tr>}</tbody></table></div>
          {filteredRows.length > 10 && <div className="table-foot">Hiển thị 10/{filteredRows.length.toLocaleString("vi-VN")} bản ghi <button type="button" onClick={() => openManager(selected)}>Xem tất cả</button></div>}
        </section>

        <aside className="data-side-card"><div className="side-icon"><Archive size={21} /></div><span className="section-kicker">CƠ CHẾ DỮ LIỆU</span><h2>Database là nguồn chuẩn</h2><p>Excel không còn là nơi lưu trữ chính. Mọi dữ liệu chuẩn đều được quản lý trực tiếp trong Database.</p><div className="side-actions"><button type="button" onClick={() => void downloadExcel()} disabled={transferBusy}><Download size={17} /><span><strong>Tải dữ liệu</strong><small>Xuất {selectedLabel} thành Excel</small></span></button><button type="button" onClick={chooseImport} disabled={transferBusy}><Upload size={17} /><span><strong>Nhập dữ liệu</strong><small>Excel → cập nhật Database</small></span></button><button type="button" onClick={() => void load()} disabled={transferBusy}><RefreshCw size={17} /><span><strong>Làm mới dữ liệu</strong><small>Đọc lại từ Database</small></span></button><button type="button" onClick={() => openManager(selected)}><Settings2 size={17} /><span><strong>Quản lý chi tiết</strong><small>Thêm / sửa / khóa dữ liệu</small></span></button></div><div className="side-note"><Import size={16} /> File nhập phải giữ nguyên tên cột của file đã tải xuống.</div></aside>
      </div>
    </main>
  );
}

export default DataStandard;
