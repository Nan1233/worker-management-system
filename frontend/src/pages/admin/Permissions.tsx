import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import api from "../../services/api";
import { useToast } from "../../components/feedback/toastContext";
import { getApiError } from "../../utils/apiError";
import { clearPermissionClientCache } from "../../security/permissions";
import "./Permissions.css";

type Perm = {code:string;name:string;module:string};
type RoleRow = {role:string;defaults:Record<string,boolean>;capabilities:Record<string,boolean>;overrides:Record<string,boolean>};
type UserRow = {id:number;username:string;full_name:string;role:string;status:string};
type Matrix = {permissions:Perm[];roles:RoleRow[];users:UserRow[];userOverrides:Record<string,Record<string,boolean>>};
const roleNames:Record<string,string> = {super_admin:"Super Admin",admin:"Admin",admin_ops:"Admin vận hành",manager:"Manager",lead:"Tổ trưởng",worker:"Công nhân"};
const adjustableRoles = ["admin_ops","manager","lead","worker"];
const roleLabel = (role:string) => roleNames[role] || role;
export default function Permissions(){
  const {showToast} = useToast();
  const [data,setData] = useState<Matrix|null>(null);
  const [loading,setLoading] = useState(true);
  const [savingKey,setSavingKey] = useState("");
  const [error,setError] = useState("");
  const [feedback,setFeedback] = useState("");
  const [userId,setUserId] = useState("");
  const [search,setSearch] = useState("");
  const seqRef=useRef(0);
  const load=useCallback(async()=>{
    const seq=++seqRef.current;
    setLoading(true);setError("");
    try{
      const response=await api.get("/permissions/matrix");
      if(seq!==seqRef.current)return;
      const payload=response.data?.data;
      if(!payload || !Array.isArray(payload.permissions) || !Array.isArray(payload.roles) || !Array.isArray(payload.users)) throw new Error("Dữ liệu phân quyền không hợp lệ.");
      setData({...payload,userOverrides:payload.userOverrides||{}});
      setUserId(previous=>payload.users.some((u:UserRow)=>String(u.id)===previous)?previous:"");
    }catch(e){
      if(seq===seqRef.current)setError(getApiError(e,"Không tải được phân quyền").message);
    }finally{if(seq===seqRef.current)setLoading(false)}
  },[]);
  useEffect(()=>{void load();return()=>{seqRef.current+=1}},[load]);
  const modules=useMemo(()=>{
    const result=new Map<string,Perm[]>();
    for(const permission of data?.permissions||[]){
      const module=String(permission.module||"Khác");
      const query=search.trim().toLocaleLowerCase("vi-VN");
      if(query && ![permission.name,permission.code,module].some(value=>String(value||"").toLocaleLowerCase("vi-VN").includes(query)))continue;
      result.set(module,[...(result.get(module)||[]),permission]);
    }
    return [...result.entries()];
  },[data,search]);
  const selected=data?.users.find(u=>String(u.id)===userId);
  const userOverrides=userId?data?.userOverrides?.[userId]||{}:{};
  const change=async(kind:"role"|"user",target:string,code:string,allowed:boolean|null)=>{
    if(savingKey||loading||!data)return;
    const key=`${kind}:${target}:${code}`;
    setSavingKey(key);setFeedback("");setError("");
    try{
      if(kind==="role")await api.put(`/permissions/roles/${target}/${code}`,{allowed});
      else await api.put(`/permissions/users/${target}/${code}`,{allowed});
      clearPermissionClientCache();
      await load();
      setFeedback(`Đã cập nhật quyền ${code} cho ${kind==="role"?roleLabel(target):selected?.full_name||selected?.username||"tài khoản"}.`);
      showToast("Đã cập nhật phân quyền","success");
    }catch(e){
      const message=getApiError(e,"Không cập nhật được quyền").message;
      setError(message);showToast(message,"error");
    }finally{setSavingKey("")}
  };
  return <section className="permission-page admin-page">
    <header className="permission-header"><div><span className="eyebrow">Security & Access Control</span>
      <h1>Vai trò & quyền</h1><p>Thiết lập quyền theo vai trò và ngoại lệ theo tài khoản. Mỗi thay đổi được lưu ngay vào hệ thống.</p>
    </div><button className="permission-refresh" type="button" disabled={loading||Boolean(savingKey)} onClick={()=>void load()}>Làm mới</button></header>
    {error&&<div className="permission-feedback error" role="alert"><span>{error}</span><button type="button" disabled={loading||Boolean(savingKey)} onClick={()=>void load()}>Thử tải lại</button></div>}
    {feedback&&<div className="permission-feedback success" role="status"><span>{feedback}</span><button type="button" aria-label="Đóng thông báo" onClick={()=>setFeedback("")}>×</button></div>}
    {savingKey&&<div className="permission-feedback working" role="status">Đang lưu thay đổi phân quyền. Vui lòng không thực hiện thêm thao tác.</div>}
    {loading&&!data?<div className="permission-loading" role="status">Đang tải cấu hình quyền...</div>:
     !data?<div className="permission-loading">Chưa có dữ liệu phân quyền. Sử dụng nút Thử tải lại để kiểm tra.</div>:
     <>
      <div className="permission-card">
        <div className="permission-card-head"><div><h2>Quyền mặc định theo vai trò</h2>
          <p>Chỉ các quyền mà vai trò hỗ trợ mới có thể cấp. “Mặc định” trả quyền về cấu hình hệ thống.</p></div>
          <input className="permission-search" type="search" aria-label="Tìm quyền" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Tìm tên quyền, mã hoặc nhóm..."/>
        </div>
        <div className="permission-table-wrap" role="region" aria-label="Ma trận phân quyền theo vai trò, có thể cuộn ngang" tabIndex={0}>
          <table><caption className="permission-table-caption">Ma trận phân quyền theo vai trò</caption>
            <thead><tr><th>Chức năng</th>{adjustableRoles.map(role=><th key={role}>{roleLabel(role)}</th>)}</tr></thead>
            <tbody>{modules.length?modules.map(([module,items])=><Fragment key={module}>
              <tr className="module-row"><td colSpan={5}>{module.toLocaleUpperCase("vi-VN")}</td></tr>
              {items.map(permission=><tr key={permission.code}><td><strong>{permission.name}</strong><small>{permission.code}</small></td>
                {adjustableRoles.map(role=>{
                  const row=data.roles.find(item=>item.role===role);
                  const supported=Boolean(row?.capabilities?.[permission.code]);
                  const overridden=Boolean(row && Object.prototype.hasOwnProperty.call(row.overrides||{},permission.code));
                  const current=overridden?row?.overrides[permission.code]:row?.defaults[permission.code];
                  const key=`role:${role}:${permission.code}`;
                  return <td key={role}><select aria-label={`${permission.name} – ${roleLabel(role)}`} disabled={loading||Boolean(savingKey)||!supported} value={!supported?"na":overridden?String(current):"default"} onChange={event=>void change("role",role,permission.code,event.target.value==="default"?null:event.target.value==="true")}>
                    <option value="default">Mặc định ({row?.defaults[permission.code]?"Cho phép":"Từ chối"})</option>
                    <option value="true">Cho phép</option><option value="false">Từ chối</option>
                    {!supported&&<option value="na">Không áp dụng</option>}
                  </select>{savingKey===key&&<small>Đang lưu...</small>}</td>;
                })}
              </tr>)}
            </Fragment>):<tr><td colSpan={5} className="permission-empty">Không có quyền nào phù hợp với bộ lọc.</td></tr>}</tbody>
          </table>
        </div>
      </div>
      <div className="permission-card">
        <div className="permission-card-head permission-user-head"><div><h2>Quyền riêng từng tài khoản</h2><p>Quyền riêng được áp dụng sau quyền vai trò; chỉ nên dùng cho ngoại lệ.</p></div>
          <select aria-label="Chọn tài khoản để phân quyền" value={userId} disabled={Boolean(savingKey)||loading} onChange={event=>setUserId(event.target.value)}>
            <option value="">Chọn tài khoản...</option>
            {data.users.filter(u=>u.role!=="admin"&&u.role!=="super_admin").map(user=><option key={user.id} value={String(user.id)}>{user.full_name||user.username} · {roleLabel(user.role)}{user.status==="inactive"?" (Ngừng hoạt động)":""}</option>)}
          </select>
        </div>
        {selected?<div className="permission-user-grid">{data.permissions.map(permission=>{
          const roleRow=data.roles.find(r=>r.role===selected.role);
          const supported=Boolean(roleRow?.capabilities?.[permission.code]);
          const overridden=Object.prototype.hasOwnProperty.call(userOverrides,permission.code);
          const key=`user:${userId}:${permission.code}`;
          return <label key={permission.code} className={!supported?"is-disabled":""}><span><strong>{permission.name}</strong><small>{permission.code}</small></span>
            <select disabled={!supported||Boolean(savingKey)||loading} value={!supported?"na":overridden?String(userOverrides[permission.code]):"default"} onChange={event=>void change("user",userId,permission.code,event.target.value==="default"?null:event.target.value==="true")}>
              <option value="default">Theo vai trò</option><option value="true">Cho phép</option><option value="false">Từ chối</option>{!supported&&<option value="na">Không áp dụng</option>}
            </select>{savingKey===key&&<small>Đang lưu...</small>}
          </label>;
        })}</div>:<div className="permission-empty">Chọn một tài khoản để cấu hình ngoại lệ.</div>}
      </div>
     </>}
  </section>;
}
