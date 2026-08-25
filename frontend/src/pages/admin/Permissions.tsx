import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../services/api';
import { useToast } from '../../components/feedback/toastContext';
import { getApiError } from '../../utils/apiError';
import { clearPermissionClientCache } from '../../security/permissions';
type Perm={code:string;name:string;module:string};
type RoleRow={role:string;defaults:Record<string,boolean>;capabilities:Record<string,boolean>;overrides:Record<string,boolean>};
type UserRow={id:number;username:string;full_name:string;role:string;status:string};
type Matrix={permissions:Perm[];roles:RoleRow[];users:UserRow[];userOverrides:Record<string,Record<string,boolean>>};
const roleNames:Record<string,string>={admin:'Admin',manager:'Manager',lead:'Tổ trưởng',worker:'Công nhân'};
export default function Permissions(){
 const toast=useToast(); const [data,setData]=useState<Matrix|null>(null); const [loading,setLoading]=useState(true); const [userId,setUserId]=useState('');
 const load=useCallback(async()=>{setLoading(true);try{const r=await api.get('/permissions/matrix');setData(r.data?.data||null);}catch(e){toast.showToast(getApiError(e,'Không tải được phân quyền').message,'error');}finally{setLoading(false)}},[toast]);
 useEffect(()=>{void load()},[load]);
 const modules=useMemo(()=>{const out=new Map<string,Perm[]>(); for(const p of data?.permissions||[]){const arr=out.get(p.module)||[];arr.push(p);out.set(p.module,arr)}return [...out.entries()]},[data]);
 const setRole=async(role:string,code:string,allowed:boolean|null)=>{try{await api.put(`/permissions/roles/${role}/${code}`,{allowed});clearPermissionClientCache();await load();toast.showToast('Đã cập nhật quyền vai trò','success')}catch(e){toast.showToast(getApiError(e,'Không cập nhật được quyền').message,'error')}};
 const setUser=async(code:string,allowed:boolean|null)=>{if(!userId)return;try{await api.put(`/permissions/users/${userId}/${code}`,{allowed});clearPermissionClientCache();await load();toast.showToast('Đã cập nhật quyền riêng người dùng','success')}catch(e){toast.showToast(getApiError(e,'Không cập nhật được quyền').message,'error')}};
 if(loading) return <div className="permission-page admin-page"><div className="permission-loading">Đang tải cấu hình quyền...</div></div>;
 if(!data) return <div className="permission-page"><div className="permission-loading">Không có dữ liệu phân quyền.</div></div>;
 const selected=data.users.find(u=>String(u.id)===userId); const uo=userId?data.userOverrides[userId]||{}:{};
 return <section className="permission-page">
  <header className="permission-header"><div><span className="eyebrow">Security & Access Control</span><h1>Vai trò & quyền</h1><p>Quyền được kiểm tra đồng thời tại giao diện và API. Admin luôn giữ toàn quyền để tránh tự khóa hệ thống.</p></div></header>
  <div className="permission-card"><div className="permission-card-head"><div><h2>Quyền mặc định theo vai trò</h2><p>Manager, Tổ trưởng và Công nhân có thể được điều chỉnh; ô “Mặc định” trả về cấu hình chuẩn của hệ thống.</p></div></div>
   <div className="permission-table-wrap"><table><thead><tr><th>Chức năng</th><th>Manager</th><th>Tổ trưởng</th><th>Công nhân</th></tr></thead><tbody>
    {modules.map(([module,items])=><Fragment key={module}><tr className="module-row"><td colSpan={4}>{module.toUpperCase()}</td></tr>{items.map(p=><tr key={p.code}><td><strong>{p.name}</strong><small>{p.code}</small></td>{['manager','lead','worker'].map(role=>{const row=data.roles.find(r=>r.role===role)!; const supported=Boolean(row.capabilities[p.code]); const hasOverride=Object.prototype.hasOwnProperty.call(row.overrides,p.code); const value=hasOverride?row.overrides[p.code]:row.defaults[p.code]; return <td key={role}><select className={!supported?'permission-select-na':''} disabled={!supported} value={supported?(hasOverride?String(value):'default'):'na'} onChange={e=>void setRole(role,p.code,e.target.value==='default'?null:e.target.value==='true')}><option value="default">Mặc định ({row.defaults[p.code]?'Cho phép':'Từ chối'})</option><option value="true">Cho phép</option><option value="false">Từ chối</option>{!supported&&<option value="na">Không áp dụng</option>}</select></td>})}</tr>)}</Fragment>)}
   </tbody></table></div>
  </div>
  <div className="permission-card"><div className="permission-card-head permission-user-head"><div><h2>Quyền riêng từng tài khoản</h2><p>Override riêng được áp dụng sau quyền vai trò và chỉ nên dùng cho ngoại lệ.</p></div><select value={userId} onChange={e=>setUserId(e.target.value)}><option value="">Chọn tài khoản...</option>{data.users.filter(u=>u.role!=='admin').map(u=><option key={u.id} value={u.id}>{u.full_name||u.username} · {roleNames[u.role]||u.role}</option>)}</select></div>
   {selected ? <div className="permission-user-grid">{data.permissions.map(p=>{const roleRow=data.roles.find(r=>r.role===selected.role); const supported=Boolean(roleRow?.capabilities[p.code]); return <label key={p.code} className={!supported?'is-disabled':''}><span><strong>{p.name}</strong><small>{p.code}</small></span><select className={!supported?'permission-select-na':''} disabled={!supported} value={supported?(Object.prototype.hasOwnProperty.call(uo,p.code)?String(uo[p.code]):'default'):'na'} onChange={e=>void setUser(p.code,e.target.value==='default'?null:e.target.value==='true')}><option value="default">Theo vai trò</option><option value="true">Cho phép</option><option value="false">Từ chối</option>{!supported&&<option value="na">Không áp dụng</option>}</select></label>})}</div> : <div className="permission-empty">Chọn một tài khoản để cấu hình ngoại lệ.</div>}
  </div>
 </section>
}