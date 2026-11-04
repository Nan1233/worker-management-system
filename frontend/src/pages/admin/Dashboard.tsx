import { Activity, ArrowRight, Database, Gauge, ShieldCheck, Users, Wrench } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getStoredUser } from "../../utils/authStorage";
import "./Dashboard.css";

const cards=[
 {title:"Tài khoản & nhân sự",text:"Quản lý tài khoản quản trị, quản lý, tổ trưởng và công nhân.",icon:Users,path:"/admin/workers"},
 {title:"Dữ liệu hệ thống",text:"Máy móc, sản phẩm, định mức, trừ giờ và loại lỗi.",icon:Database,path:"/admin/master/machines"},
 {title:"Vai trò & quyền",text:"Kiểm soát quyền truy cập theo vai trò và chức năng.",icon:ShieldCheck,path:"/admin/permissions"},
 {title:"Nhật ký hoạt động",text:"Theo dõi các hoạt động báo cáo và thay đổi trong hệ thống.",icon:Activity,path:"/admin/system"},
 {title:"Master Control Center",text:"Tổng quan dữ liệu thật, tài khoản, quyền, sức khỏe hệ thống và audit.",icon:Gauge,path:"/admin/master-control"},
];
export default function AdminDashboard(){
 const navigate=useNavigate();
 // Master Control Center entry points are shown to Super Admin only (backend enforces access).
 const isSuperAdmin=getStoredUser()?.is_super_admin===true;
 const visibleCards=cards.filter(card=>card.path!=="/admin/master-control"||isSuperAdmin);
 return <div className="admin-dashboard-page">
  <div className="admin-dashboard-hero"><div><div className="admin-eyebrow">ADMIN CONSOLE</div><h1>Quản trị hệ thống</h1><p>Điều hành người dùng, dữ liệu cấu hình, phân quyền và trạng thái vận hành của KTC Production Control.</p></div>{isSuperAdmin?<button type="button" className="admin-system-pill" onClick={()=>navigate("/admin/master-control")}><span/> Master Control Center</button>:null}</div>
  <section className="admin-overview-grid"><div className="admin-overview-card"><span className="admin-overview-icon"><Users size={20}/></span><div><strong>Người dùng</strong><small>Quản lý tài khoản và nhân sự</small></div><ArrowRight size={17}/></div><div className="admin-overview-card"><span className="admin-overview-icon"><Wrench size={20}/></span><div><strong>Dữ liệu nền</strong><small>Cấu hình master data toàn hệ thống</small></div><ArrowRight size={17}/></div><div className="admin-overview-card"><span className="admin-overview-icon"><ShieldCheck size={20}/></span><div><strong>Bảo mật & quyền</strong><small>Vai trò và quyền truy cập</small></div><ArrowRight size={17}/></div></section>
  <div className="admin-section-heading"><div><h2>Trung tâm quản trị</h2><p>Chọn nhóm chức năng cần quản lý.</p></div></div>
  <section className="admin-control-grid">{visibleCards.map(card=>{const Icon=card.icon;return <button key={card.path} type="button" className="admin-control-card" onClick={()=>navigate(card.path)}><span className="admin-control-icon"><Icon size={21}/></span><span className="admin-control-copy"><strong>{card.title}</strong><small>{card.text}</small></span><ArrowRight size={18}/></button>})}</section>
  <section className="admin-notice"><div><strong>Quyền quản trị toàn hệ thống</strong><p>Admin quản lý cấu hình, người dùng và phân quyền. Các màn hình vận hành báo cáo vẫn có thể truy cập trực tiếp khi cần kiểm tra.</p></div></section>
 </div>;
}
