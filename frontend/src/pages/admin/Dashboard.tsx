import { Activity, ArrowRight, Database, ShieldCheck, Users, Wrench } from "lucide-react";
import { useNavigate } from "react-router-dom";
import "./Dashboard.css";

const overviewCards = [
  { title: "Người dùng", text: "Quản lý tài khoản và nhân sự", icon: Users, path: "/admin/workers" },
  { title: "Dữ liệu nền", text: "Cấu hình master data toàn hệ thống", icon: Wrench, path: "/admin/master/machines" },
  { title: "Bảo mật & quyền", text: "Vai trò và quyền truy cập", icon: ShieldCheck, path: "/admin/permissions" },
];

const cards = [
  { title: "Tài khoản & nhân sự", text: "Quản lý tài khoản quản trị, quản lý, tổ trưởng và công nhân.", icon: Users, path: "/admin/workers" },
  { title: "Dữ liệu hệ thống", text: "Máy móc, sản phẩm, định mức, trừ giờ và loại lỗi.", icon: Database, path: "/admin/master/machines" },
  { title: "Vai trò & quyền", text: "Kiểm soát quyền truy cập theo vai trò và chức năng.", icon: ShieldCheck, path: "/admin/permissions" },
  { title: "Nhật ký hoạt động", text: "Theo dõi các hoạt động báo cáo và thay đổi trong hệ thống.", icon: Activity, path: "/admin/system" },
];

export default function AdminDashboard() {
  const navigate = useNavigate();

  return (
    <div className="admin-dashboard-page">
      <section className="admin-dashboard-hero">
        <div>
          <div className="admin-eyebrow">ADMIN CONSOLE</div>
          <h1>Quản trị hệ thống</h1>
          <p>Quản lý tài khoản, dữ liệu nền, quyền truy cập và hoạt động của KTC Production Control từ một nơi.</p>
        </div>
        <div className="admin-system-pill">
          <span />
          Khu vực quản trị
        </div>
      </section>

      <section className="admin-overview-grid" aria-label="Truy cập nhanh">
        {overviewCards.map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.path}
              type="button"
              className="admin-overview-card"
              onClick={() => navigate(card.path)}
            >
              <span className="admin-overview-icon"><Icon size={20} /></span>
              <span className="admin-overview-copy">
                <strong>{card.title}</strong>
                <small>{card.text}</small>
              </span>
              <ArrowRight size={17} aria-hidden="true" />
            </button>
          );
        })}
      </section>

      <div className="admin-section-heading">
        <div>
          <h2>Trung tâm quản trị</h2>
          <p>Chọn nhóm chức năng cần quản lý.</p>
        </div>
      </div>

      <section className="admin-control-grid" aria-label="Nhóm chức năng quản trị">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.path}
              type="button"
              className="admin-control-card"
              onClick={() => navigate(card.path)}
            >
              <span className="admin-control-icon"><Icon size={21} /></span>
              <span className="admin-control-copy">
                <strong>{card.title}</strong>
                <small>{card.text}</small>
              </span>
              <ArrowRight size={18} aria-hidden="true" />
            </button>
          );
        })}
      </section>

      <section className="admin-notice">
        <div>
          <strong>Nguyên tắc quản trị</strong>
          <p>Chỉ thực hiện các thao tác được cấp quyền. Các thay đổi quan trọng cần được kiểm soát và có thể truy vết qua nhật ký hệ thống.</p>
        </div>
      </section>
    </div>
  );
}
