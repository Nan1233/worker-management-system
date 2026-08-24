import { useEffect, useMemo, useState } from "react";
import { Archive, ArrowRight, Boxes, CheckCircle2, Database, Factory, FileCog, HardDrive, RefreshCw, Search, Settings2, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import api from "../../services/api";
import "./DataStandard.css";

type Resource = "processes" | "machines" | "standards" | "users" | "defects" | "deductions";
type Row = Record<string, unknown> & { id?: number; status?: string };

const cards: { key: Resource; title: string; description: string; icon: typeof Database; color: string; path: string }[] = [
  { key: "standards", title: "Sản phẩm & định mức", description: "Mã sản phẩm và sản lượng chuẩn dùng để tính kết quả.", icon: Boxes, color: "blue", path: "standards" },
  { key: "machines", title: "Máy móc", description: "Danh sách máy và cấu hình theo từng công đoạn.", icon: HardDrive, color: "purple", path: "machines" },
  { key: "processes", title: "Công đoạn", description: "Các công đoạn sản xuất đang được hệ thống sử dụng.", icon: Factory, color: "orange", path: "processes" },
  { key: "users", title: "Công nhân", description: "Nhân sự, vai trò và phân công công đoạn.", icon: Users, color: "green", path: "users" },
  { key: "defects", title: "Loại lỗi", description: "Danh mục lỗi NG theo từng công đoạn.", icon: FileCog, color: "pink", path: "defects" },
  { key: "deductions", title: "Trừ giờ", description: "Danh mục lý do trừ giờ trong sản xuất.", icon: Settings2, color: "cyan", path: "deductions" },
];

const labels: Record<Resource, string> = { processes: "Công đoạn", machines: "Máy móc", standards: "Sản phẩm & định mức", users: "Công nhân", defects: "Loại lỗi", deductions: "Trừ giờ" };

function DataStandard() {
  const navigate = useNavigate();
  const role = window.location.pathname.split("/")[1] || "manager";
  const [counts, setCounts] = useState<Record<Resource, number>>({ processes: 0, machines: 0, standards: 0, users: 0, defects: 0, deductions: 0 });
  const [selected, setSelected] = useState<Resource>("standards");
  const [rows, setRows] = useState<Row[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = async () => {
    setLoading(true);
    const next = { ...counts };
    try {
      await Promise.all(cards.map(async card => {
        try {
          const endpoint = card.key === "users" ? "/users" : `/admin/master/${card.key}`;
          const response = await api.get(endpoint);
          const data = Array.isArray(response.data?.data) ? response.data.data : [];
          next[card.key] = data.length;
          if (card.key === selected) setRows(data);
        } catch {
          next[card.key] = 0;
        }
      }));
      setCounts(next);
      setUpdatedAt(new Date());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);
  useEffect(() => {
    const run = async () => {
      try {
        const endpoint = selected === "users" ? "/users" : `/admin/master/${selected}`;
        const response = await api.get(endpoint);
        setRows(Array.isArray(response.data?.data) ? response.data.data : []);
      } catch {
        setRows([]);
      }
    };
    void run();
  }, [selected]);

  const filteredRows = useMemo(() => rows.filter(row => JSON.stringify(row).toLowerCase().includes(query.toLowerCase())), [rows, query]);

  const openManager = (resource: Resource) => navigate(`/${role}/master/${resource}`);

  return (
    <main className="data-standard-page manager-page">
      <header className="data-standard-heading">
        <div>
          <span className="eyebrow">MASTER DATA</span>
          <h1>Dữ liệu chuẩn</h1>
          <p>Quản lý dữ liệu đầu vào của hệ thống. Dữ liệu được đọc trực tiếp từ cơ sở dữ liệu, không phụ thuộc file Excel.</p>
        </div>
        <button className="data-refresh" type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={16} className={loading ? "spin" : ""} /> Cập nhật dữ liệu</button>
      </header>

      <section className="data-status-strip">
        <div className="status-main"><span className="status-icon"><Database size={21} /></span><div><strong>Dữ liệu hệ thống</strong><span>Đang sử dụng dữ liệu chuẩn trong Database</span></div><b><CheckCircle2 size={17} /> Đã kết nối</b></div>
        <div className="status-item"><span>Lần tải gần nhất</span><strong>{updatedAt ? updatedAt.toLocaleString("vi-VN") : "Đang tải..."}</strong></div>
        <div className="status-item"><span>Tổng nhóm dữ liệu</span><strong>6 nhóm</strong></div>
        <div className="status-item"><span>Excel xuất báo cáo</span><strong className="disabled-label">Đã thay thế</strong></div>
      </section>

      <div className="data-layout">
        <section className="data-main-card">
          <div className="section-head"><div><span className="section-kicker">CẤU HÌNH DỮ LIỆU</span><h2>Danh mục dữ liệu chuẩn</h2><p>Chọn nhóm dữ liệu để xem nhanh hoặc mở trang quản lý chi tiết.</p></div></div>
          <div className="data-card-grid">
            {cards.map(card => { const Icon = card.icon; return <button key={card.key} type="button" className={`data-card ${card.color} ${selected === card.key ? "selected" : ""}`} onClick={() => setSelected(card.key)}><span className="data-card-icon"><Icon size={21} /></span><span className="data-card-copy"><strong>{card.title}</strong><small>{card.description}</small><b>{loading ? "..." : counts[card.key].toLocaleString("vi-VN")} bản ghi</b></span><ArrowRight size={18} /></button>; })}
          </div>

          <div className="data-table-head"><div><span className="section-kicker">DỮ LIỆU HIỆN TẠI</span><h2>{labels[selected]}</h2></div><div className="table-actions"><label><Search size={16} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Tìm kiếm..." /></label><button type="button" onClick={() => openManager(selected)}>Quản lý chi tiết</button></div></div>
          <div className="data-table-wrap"><table><thead><tr><th>ID</th><th>Mã / tên</th><th>Thông tin</th><th>Trạng thái</th></tr></thead><tbody>{filteredRows.slice(0, 10).map((row, index) => <tr key={String(row.id || index)}><td>{String(row.id ?? "—")}</td><td><strong>{String(row.product_code || row.process_code || row.machine_code || row.username || row.defect_code || row.deduction_code || row.full_name || "—")}</strong></td><td>{String(row.process_name || row.product_name || row.machine_name || row.full_name || row.defect_name || row.deduction_name || row.standard_output || "—")}</td><td><span className={`data-status ${row.status === "inactive" ? "off" : "on"}`}>{row.status === "inactive" ? "Ngừng dùng" : "Đang dùng"}</span></td></tr>)}{!loading && filteredRows.length === 0 && <tr><td colSpan={4} className="empty">Không có dữ liệu phù hợp.</td></tr>}</tbody></table></div>
          {filteredRows.length > 10 && <div className="table-foot">Hiển thị 10/{filteredRows.length.toLocaleString("vi-VN")} bản ghi <button type="button" onClick={() => openManager(selected)}>Xem tất cả</button></div>}
        </section>

        <aside className="data-side-card"><div className="side-icon"><Archive size={21} /></div><span className="section-kicker">CƠ CHẾ DỮ LIỆU</span><h2>Không phụ thuộc Excel</h2><p>Trang quản lý này sử dụng dữ liệu chuẩn trực tiếp từ Database. Không còn nút xuất/mở file Excel gây lỗi.</p><ul><li><CheckCircle2 size={17} /><span><strong>Dữ liệu tập trung</strong><small>Một nguồn dữ liệu chuẩn cho toàn hệ thống.</small></span></li><li><CheckCircle2 size={17} /><span><strong>Cập nhật tức thời</strong><small>Thay đổi dữ liệu được áp dụng sau khi lưu.</small></span></li><li><CheckCircle2 size={17} /><span><strong>Quản lý riêng</strong><small>Vẫn có trang CRUD chi tiết cho từng danh mục.</small></span></li></ul><button type="button" onClick={() => openManager(selected)}>Mở quản lý dữ liệu <ArrowRight size={16} /></button></aside>
      </div>
    </main>
  );
}

export default DataStandard;
