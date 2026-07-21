/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../api/axios';
import { getApiError } from '../../utils/apiError';
import './MasterData.css';

type Row = Record<string, unknown> & { id?: number; worker_id?: number; status?: string };
type Resource = 'users'|'workers'|'processes'|'defects'|'deductions'|'machines'|'standards';

type Field = { key:string; label:string; type?:'text'|'number'|'select'; required?:boolean; options?:{value:string;label:string}[] };

const allTabs: {key:Resource;label:string;description:string;roles:string[]}[] = [
  {key:'users',label:'Người dùng',description:'Thêm công nhân, tổ trưởng và quản lý',roles:['lead','manager','admin']},
  {key:'workers',label:'Công nhân',description:'Hồ sơ, trạng thái và % học việc',roles:['manager','admin']},
  {key:'processes',label:'Công đoạn',description:'Danh mục công đoạn sản xuất',roles:['manager','admin']},
  {key:'machines',label:'Máy',description:'Máy theo từng công đoạn',roles:['manager','admin']},
  {key:'standards',label:'Định mức',description:'Mã hàng và sản lượng chuẩn',roles:['manager','admin']},
  {key:'defects',label:'Loại lỗi',description:'Danh mục NG theo công đoạn',roles:['manager','admin']},
  {key:'deductions',label:'Trừ giờ',description:'Lý do và thứ tự hiển thị',roles:['manager','admin']},
];

const baseFields: Record<Exclude<Resource,'users'|'workers'>,Field[]> = {
  processes:[{key:'process_code',label:'Mã công đoạn',required:true},{key:'process_name',label:'Tên công đoạn',required:true},{key:'description',label:'Mô tả'}],
  machines:[{key:'process_id',label:'Công đoạn',type:'select',required:true},{key:'machine_code',label:'Mã máy',required:true},{key:'machine_name',label:'Tên máy',required:true}],
  standards:[{key:'process_id',label:'Công đoạn',type:'select',required:true},{key:'work_type',label:'Loại công việc',required:true},{key:'product_code',label:'Mã sản phẩm',required:true},{key:'standard_output',label:'Định mức',type:'number',required:true}],
  defects:[{key:'process_id',label:'Công đoạn',type:'select',required:true},{key:'defect_code',label:'Mã lỗi',required:true},{key:'defect_name',label:'Tên lỗi',required:true},{key:'sort_order',label:'Thứ tự',type:'number'}],
  deductions:[{key:'process_id',label:'Công đoạn',type:'select',required:true},{key:'deduction_code',label:'Mã trừ giờ',required:true},{key:'deduction_name',label:'Tên trừ giờ',required:true},{key:'sort_order',label:'Thứ tự',type:'number'}],
};

const roleLabels:Record<string,string>={manager:'Quản lý',lead:'Tổ trưởng',worker:'Công nhân'};

const workerFields:Field[]=[
  {key:'worker_code',label:'Mã công nhân',required:true},{key:'full_name',label:'Họ tên'},
  {key:'phone',label:'Điện thoại'},{key:'department',label:'Bộ phận'},{key:'position',label:'Vị trí'},
  {key:'training_percent',label:'% học việc',type:'number'}
];

function MasterData(){
  const currentUser=useMemo(()=>{try{return JSON.parse(localStorage.getItem('user')||'null') as {role?:string}|null;}catch{return null;}},[]);
  const tabs=useMemo(()=>allTabs.filter(t=>t.roles.includes(currentUser?.role||'')),[currentUser]);
  const [resource,setResource]=useState<Resource>('users');
  const [rows,setRows]=useState<Row[]>([]); const [processes,setProcesses]=useState<Row[]>([]);
  const [loading,setLoading]=useState(false); const [error,setError]=useState(''); const [query,setQuery]=useState('');
  const [editing,setEditing]=useState<Row|null>(null); const [form,setForm]=useState<Record<string,string>>({});

  const loadProcesses=useCallback(async()=>{const r=await api.get('/admin/master/processes');setProcesses(r.data.data||[]);},[]);
  const load=useCallback(async()=>{
    setLoading(true);setError('');
    try{ const url=resource==='users'?'/users':resource==='workers'?'/workers':`/admin/master/${resource}`; const r=await api.get(url); setRows(r.data.data||[]); }
    catch(e){setError(getApiError(e,'Không thể tải dữ liệu').message);}
    finally{setLoading(false);}
  },[resource]);
  useEffect(()=>{if(currentUser?.role!=='lead')void loadProcesses();},[loadProcesses,currentUser]); useEffect(()=>{void load();setEditing(null);setForm({});},[load]);

  const fields=useMemo(()=>{
    if(resource==='users'){
      const allowed=currentUser?.role==='admin'?['manager','lead','worker']:currentUser?.role==='manager'?['lead','worker']:['worker'];
      return [
        {key:'username',label:'Tên đăng nhập',required:true},
        {key:'full_name',label:'Họ tên',required:true},
        {key:'role',label:'Vai trò',type:'select',required:true,options:allowed.map(value=>({value,label:roleLabels[value]}))},
        {key:'password',label:'Mật khẩu mới'},
        {key:'worker_code',label:'Mã công nhân'},
        {key:'phone',label:'Điện thoại'},
        {key:'department',label:'Bộ phận'},
        {key:'position',label:'Vị trí'},
        {key:'training_percent',label:'% học việc',type:'number'}
      ] as Field[];
    }
    const source=resource==='workers'?workerFields:baseFields[resource];
    return source.map(f=>f.key==='process_id'?{...f,options:processes.map(p=>({value:String(p.id),label:String(p.process_name)}))}:f);
  },[resource,processes,currentUser]);
  const filtered=useMemo(()=>rows.filter(row=>JSON.stringify(row).toLowerCase().includes(query.toLowerCase())),[rows,query]);

  const openCreate=()=>{const defaultRole=currentUser?.role==='lead'?'worker':currentUser?.role==='manager'?'lead':'manager';setEditing({});setForm({status:'active',sort_order:'0',role:resource==='users'?defaultRole:''});};
  const openEdit=(row:Row)=>{setEditing(row);const next:Record<string,string>={};fields.forEach(f=>next[f.key]=String(row[f.key]??''));next.status=String(row.status||'active');setForm(next);};
  const save=async()=>{
    try{
      if(resource==='users'){
        const payload={...form};
        if(editing?.id){delete payload.role;delete payload.worker_code;delete payload.phone;delete payload.department;delete payload.position;delete payload.training_percent;if(!payload.password)delete payload.password;await api.put(`/users/${editing.id}`,payload);}
        else await api.post('/users',payload);
      }else if(resource==='workers'){
        if(!editing?.worker_id) return;
        const payload={...form}; delete payload.full_name;
        await api.put(`/admin/master/workers/${editing.worker_id}/profile`,payload);
      }else if(editing?.id){const payload={...form};await api.put(`/admin/master/${resource}/${editing.id}`,payload);}
      else{await api.post(`/admin/master/${resource}`,form);}
      setEditing(null);setForm({});await load();
    }catch(e){setError(getApiError(e,'Không thể lưu dữ liệu').message);}
  };
  const toggle=async(row:Row)=>{
    try{
      const status=row.status==='active'?'inactive':'active';
      if(resource==='users') await api.put(`/users/${row.id}`,{status});
      else if(resource==='workers') await api.put(`/admin/master/workers/${row.worker_id}/profile`,{status});
      else await api.put(`/admin/master/${resource}/${row.id}`,{status});
      await load();
    }catch(e){setError(getApiError(e,'Không thể đổi trạng thái').message);}
  };

  return <div className="master-page">
    <div className="master-heading"><div><span>QUẢN TRỊ DỮ LIỆU GỐC</span><h1>Trung tâm quản lý nhà máy</h1><p>Thêm mới người dùng theo phân quyền và quản lý tập trung dữ liệu vận hành nhà máy.</p></div>
      {(resource==='users'||resource!=='workers')&&<button className="primary" onClick={openCreate}>+ Thêm mới</button>}</div>
    <div className="master-tabs">{tabs.map(t=><button key={t.key} className={resource===t.key?'active':''} onClick={()=>setResource(t.key)}><strong>{t.label}</strong><small>{t.description}</small></button>)}</div>
    <div className="master-toolbar"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Tìm theo mã, tên, công đoạn..."/><span>{filtered.length} bản ghi</span></div>
    {error&&<div className="master-error">{error}</div>}
    <div className="master-table-wrap"><table><thead><tr>{fields.map(f=><th key={f.key}>{f.label}</th>)}<th>Trạng thái</th><th>Thao tác</th></tr></thead>
      <tbody>{loading?<tr><td colSpan={fields.length+2}>Đang tải...</td></tr>:filtered.map((row,index)=><tr key={String(row.id||row.worker_id||index)}>{fields.map(f=><td key={f.key}>{f.key==='process_id'?String(row.process_name||''):f.key==='role'?String(roleLabels[String(row.role)]||row.role||''):String(row[f.key]??'')}</td>)}<td><span className={`status ${row.status}`}>{row.status==='inactive'?'Ngừng dùng':'Đang dùng'}</span></td><td><div className="actions"><button onClick={()=>openEdit(row)}>Sửa</button><button onClick={()=>void toggle(row)}>{row.status==='active'?'Khóa':'Mở'}</button></div></td></tr>)}</tbody></table></div>
    {editing&&<div className="modal-backdrop" onMouseDown={()=>setEditing(null)}><div className="modal-card" onMouseDown={e=>e.stopPropagation()}><h2>{editing.id||editing.worker_id?'Cập nhật dữ liệu':'Thêm dữ liệu mới'}</h2><div className="form-grid">{fields.map(f=><label key={f.key}><span>{f.label}{f.required?' *':''}</span>{f.type==='select'?<select disabled={resource==='users'&&Boolean(editing?.id)&&f.key==='role'} value={form[f.key]||''} onChange={e=>setForm({...form,[f.key]:e.target.value})}><option value="">Chọn...</option>{f.options?.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>:<input disabled={resource==='workers'&&f.key==='full_name'} type={f.key==='password'?'password':f.type==='number'?'number':'text'} value={form[f.key]||''} onChange={e=>setForm({...form,[f.key]:e.target.value})}/>}</label>)}<label><span>Trạng thái</span><select value={form.status||'active'} onChange={e=>setForm({...form,status:e.target.value})}><option value="active">Đang dùng</option><option value="inactive">Ngừng dùng</option></select></label></div><div className="modal-actions"><button onClick={()=>setEditing(null)}>Hủy</button><button className="primary" onClick={()=>void save()}>Lưu thay đổi</button></div></div></div>}
  </div>;
}
export default MasterData;
