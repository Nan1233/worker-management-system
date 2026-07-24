import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../api/axios';
import { getApiError } from '../../utils/apiError';
import './MasterData.css';

type Row = Record<string, unknown> & { id?: number; status?: string; role?: string };
type Resource = 'users'|'processes'|'defects'|'deductions'|'machines'|'standards';
type Field = { key:string; label:string; type?:'text'|'number'|'select'; required?:boolean; options?:{value:string;label:string}[] };
type ProcessOption = { id:number; process_code:string; process_name:string };

const allTabs:{key:Resource;label:string;description:string;roles:string[]}[]=[
  {key:'users',label:'Người dùng',description:'Tài khoản, hồ sơ công nhân và phân công công đoạn',roles:['lead','manager','admin']},
  {key:'processes',label:'Công đoạn',description:'Gia công (Cắt/Lồng) và các công đoạn sản xuất',roles:['manager','admin']},
  {key:'machines',label:'Máy',description:'Máy theo từng công đoạn',roles:['manager','admin']},
  {key:'standards',label:'Sản phẩm & định mức',description:'Mã sản phẩm và sản lượng chuẩn',roles:['manager','admin']},
  {key:'defects',label:'Loại lỗi',description:'Danh mục NG lấy trực tiếp theo công đoạn',roles:['manager','admin']},
  {key:'deductions',label:'Trừ giờ',description:'Lý do và thứ tự hiển thị',roles:['manager','admin']},
];

const baseFields:Record<Exclude<Resource,'users'>,Field[]>={
  processes:[{key:'process_code',label:'Mã công đoạn',required:true},{key:'process_name',label:'Tên công đoạn',required:true},{key:'description',label:'Mô tả'}],
  machines:[{key:'process_id',label:'Công đoạn',type:'select',required:true},{key:'machine_code',label:'Mã máy',required:true},{key:'machine_name',label:'Tên máy',required:true},{key:'exclude_kqd_from_tt',label:'Quy tắc KQD',type:'select',options:[{value:'0',label:'Có tính KQD vào TT'},{value:'1',label:'Không tính KQD vào TT'}]}],
  standards:[{key:'process_id',label:'Công đoạn',type:'select',required:true},{key:'product_code',label:'Mã sản phẩm',required:true},{key:'standard_output',label:'Định mức (số nguyên)',type:'number',required:true}],
  defects:[{key:'process_id',label:'Công đoạn',type:'select',required:true},{key:'defect_code',label:'Mã lỗi',required:true},{key:'defect_name',label:'Tên lỗi',required:true},{key:'sort_order',label:'Thứ tự',type:'number'}],
  deductions:[{key:'process_id',label:'Công đoạn',type:'select',required:true},{key:'deduction_code',label:'Mã trừ giờ',required:true},{key:'deduction_name',label:'Tên trừ giờ',required:true},{key:'sort_order',label:'Thứ tự',type:'number'}],
};

const roleLabels:Record<string,string>={manager:'Quản lý',lead:'Tổ trưởng',worker:'Công nhân'};

function parseProcessIds(value:unknown):string[]{
  if(Array.isArray(value)) return value.map(String);
  return String(value||'').split(',').map(item=>item.trim()).filter(Boolean);
}

function MasterData(){
  const navigate=useNavigate();
  const params=useParams<{resource?:string}>();
  const currentUser=useMemo(()=>{try{return JSON.parse(localStorage.getItem('user')||'null') as {role?:string}|null;}catch{return null;}},[]);
  const tabs=useMemo(()=>allTabs.filter(tab=>tab.roles.includes(currentUser?.role||'')),[currentUser]);
  const requestedResource=String(params.resource||'users') as Resource;
  const initialResource=allTabs.some(tab=>tab.key===requestedResource&&tab.roles.includes(currentUser?.role||''))?requestedResource:'users';
  const [resource,setResource]=useState<Resource>(initialResource);
  const [rows,setRows]=useState<Row[]>([]);
  const [processes,setProcesses]=useState<ProcessOption[]>([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [query,setQuery]=useState('');
  const [editing,setEditing]=useState<Row|null>(null);
  const [form,setForm]=useState<Record<string,string>>({});
  const [selectedProcessIds,setSelectedProcessIds]=useState<string[]>([]);
  const [page,setPage]=useState(1);
  const [saving,setSaving]=useState(false);
  const pageSize=20;

  const loadProcesses=useCallback(async()=>{
    const response=await api.get('/users/options/processes');
    setProcesses(response.data.data||[]);
  },[]);

  const load=useCallback(async()=>{
    setLoading(true);setError('');
    try{
      const url=resource==='users'?'/users':`/admin/master/${resource}`;
      const response=await api.get(url);
      setRows(response.data.data||[]);
    }catch(err){setError(getApiError(err,'Không thể tải dữ liệu').message);}
    finally{setLoading(false);}
  },[resource]);

  useEffect(()=>{
    const allowed=tabs.some(tab=>tab.key===requestedResource);
    const nextResource=allowed?requestedResource:'users';
    setResource(nextResource);
    setEditing(null);
    setForm({});
    setSelectedProcessIds([]);
    if(!allowed&&params.resource!=='users') navigate(`/${currentUser?.role||'manager'}/master/users`,{replace:true});
  },[requestedResource,tabs,navigate,params.resource,currentUser?.role]);

  useEffect(()=>{const timer=window.setTimeout(()=>{void loadProcesses().catch(err=>setError(getApiError(err,'Không thể tải công đoạn').message));},0);return()=>window.clearTimeout(timer);},[loadProcesses]);
  useEffect(()=>{const timer=window.setTimeout(()=>{void load();},0);return()=>window.clearTimeout(timer);},[load]);

  const allowedRoles=useMemo(()=>currentUser?.role==='admin'?['manager','lead','worker']:currentUser?.role==='manager'?['lead','worker']:['worker'],[currentUser]);
  const selectedRole=form.role||String(editing?.role||'');

  const fields=useMemo<Field[]>(()=>{
    if(resource==='users'){
      const common:Field[]=[
        {key:'username',label:'Tên đăng nhập',required:true},
        {key:'full_name',label:'Họ tên',required:true},
        {key:'role',label:'Vai trò',type:'select',required:true,options:allowedRoles.map(value=>({value,label:roleLabels[value]}))},
        {key:'password',label:editing?.id?'Mật khẩu mới':'Mật khẩu',required:!editing?.id},
      ];
      if(selectedRole==='worker') common.push(
        {key:'worker_code',label:'Mã công nhân',required:true},
        {key:'phone',label:'Điện thoại'},
        {key:'department',label:'Bộ phận'},
        {key:'position',label:'Vị trí'},
        {key:'training_percent',label:'% học việc',type:'number'}
      );
      return common;
    }
    return baseFields[resource].map(field=>field.key==='process_id'?{...field,options:processes.map(process=>({value:String(process.id),label:process.process_name}))}:field);
  },[resource,processes,allowedRoles,selectedRole,editing]);

  const filtered=useMemo(()=>rows.filter(row=>JSON.stringify(row).toLowerCase().includes(query.toLowerCase())),[rows,query]);
  const pageCount=Math.max(1,Math.ceil(filtered.length/pageSize));
  const visibleRows=filtered.slice((page-1)*pageSize,page*pageSize);
  useEffect(()=>setPage(1),[resource,query]);
  useEffect(()=>{if(page>pageCount)setPage(pageCount);},[page,pageCount]);

  const openCreate=()=>{
    const defaultRole=currentUser?.role==='lead'?'worker':currentUser?.role==='manager'?'lead':'manager';
    setEditing({});
    setForm({status:'active',sort_order:'0',exclude_kqd_from_tt:'0',role:resource==='users'?defaultRole:'',work_type:resource==='standards'?'standard':''});
    setSelectedProcessIds([]);
  };

  const openEdit=(row:Row)=>{
    setEditing(row);
    const next:Record<string,string>={};
    Object.entries(row).forEach(([key,value])=>next[key]=String(value??''));
    next.status=String(row.status||'active');
    setForm(next);
    setSelectedProcessIds(parseProcessIds(row.process_ids));
  };

  const toggleProcess=(id:string)=>setSelectedProcessIds(previous=>previous.includes(id)?previous.filter(value=>value!==id):[...previous,id]);

  const save=async()=>{
    if(saving)return;
    const missing=fields.filter(field=>field.required&&!String(form[field.key]||'').trim());
    if(resource==='users'&&['manager','lead','worker'].includes(selectedRole)&&selectedProcessIds.length===0){setError('Vui lòng chọn ít nhất một công đoạn');return;}
    if(missing.length){setError(`Vui lòng nhập: ${missing.map(field=>field.label).join(', ')}`);return;}
    if(resource==='standards'&&(!Number.isInteger(Number(form.standard_output))||Number(form.standard_output)<=0)){setError('Định mức phải là số nguyên dương');return;}
    setSaving(true);setError('');
    try{
      if(resource==='users'){
        const payload:Record<string,unknown>={...form};
        if(!payload.password) delete payload.password;
        payload.process_ids=selectedProcessIds.map(Number);
        if(selectedRole!=='worker') {
          for(const key of ['worker_code','phone','department','position','training_percent']) delete payload[key];
        }
        if(editing?.id){delete payload.role;await api.put(`/users/${editing.id}`,payload);}
        else await api.post('/users',payload);
      }else{
        const payload={...form};
        if(resource==='standards'&&!payload.work_type)payload.work_type='standard';
        if(editing?.id) await api.put(`/admin/master/${resource}/${editing.id}`,payload);
        else await api.post(`/admin/master/${resource}`,payload);
      }
      setEditing(null);setForm({});setSelectedProcessIds([]);await load();
    }catch(err){setError(getApiError(err,'Không thể lưu dữ liệu').message);}
    finally{setSaving(false);}
  };

  const toggle=async(row:Row)=>{
    const action=row.status==='active'?'khóa':'mở lại';
    if(!window.confirm(`Bạn có chắc muốn ${action} dữ liệu này?`))return;
    try{
      const status=row.status==='active'?'inactive':'active';
      if(resource==='users') await api.put(`/users/${row.id}`,{status});
      else await api.put(`/admin/master/${resource}/${row.id}`,{status});
      await load();
    }catch(err){setError(getApiError(err,'Không thể đổi trạng thái').message);}
  };

  const tableFields=resource==='users'
    ? [{key:'username',label:'Tên đăng nhập'},{key:'full_name',label:'Họ tên'},{key:'role',label:'Vai trò'},{key:'worker_code',label:'Mã công nhân'},{key:'process_names',label:'Công đoạn'}]
    : fields.filter(field=>field.key!=='password');

  return <div className="master-page">
    <div className="master-heading"><div><h1>Trung tâm quản lý</h1></div><button className="primary" onClick={openCreate}>+ Thêm mới</button></div>
    <div className="master-tabs">{tabs.map(tab=><button key={tab.key} className={resource===tab.key?'active':''} onClick={()=>navigate(`/${currentUser?.role||'manager'}/master/${tab.key}`)}><strong>{tab.label}</strong></button>)}</div>
    <div className="master-toolbar"><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Tìm theo mã, tên, công đoạn..."/><span>{filtered.length} bản ghi</span></div>
    {error&&<div className="master-error">{error}</div>}
    <div className="master-table-wrap"><table><thead><tr>{tableFields.map(field=><th key={field.key}>{field.label}</th>)}<th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>
      {loading?<tr><td colSpan={tableFields.length+2}>Đang tải...</td></tr>:filtered.length===0?<tr><td colSpan={tableFields.length+2}>Chưa có dữ liệu phù hợp.</td></tr>:visibleRows.map((row,index)=><tr key={String(row.id||index)}>{tableFields.map(field=><td key={field.key}>{field.key==='process_id'?String(row.process_name||''):field.key==='role'?String(roleLabels[String(row.role)]||row.role||''):String(row[field.key]??'')}</td>)}<td><span className={`status ${row.status}`}>{row.status==='inactive'?'Ngừng dùng':'Đang dùng'}</span></td><td><div className="actions"><button onClick={()=>openEdit(row)}>Sửa</button><button onClick={()=>void toggle(row)}>{row.status==='active'?'Khóa':'Mở'}</button></div></td></tr>)}
    </tbody></table></div>
    {filtered.length>pageSize&&<div className="master-pagination"><button disabled={page<=1} onClick={()=>setPage(value=>value-1)}>Trước</button><span>Trang {page}/{pageCount}</span><button disabled={page>=pageCount} onClick={()=>setPage(value=>value+1)}>Sau</button></div>}
    {editing&&<div className="modal-backdrop" onMouseDown={()=>setEditing(null)}><div className="modal-card" onMouseDown={event=>event.stopPropagation()}><h2>{editing.id?'Cập nhật người dùng/dữ liệu':'Thêm dữ liệu mới'}</h2><div className="form-grid">
      {fields.map(field=><label key={field.key}><span>{field.label}{field.required?' *':''}</span>{field.type==='select'?<select disabled={resource==='users'&&Boolean(editing?.id)&&field.key==='role'} value={form[field.key]||''} onChange={event=>setForm({...form,[field.key]:event.target.value})}><option value="">Chọn...</option>{field.options?.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select>:<input type={field.key==='password'?'password':field.type==='number'?'number':'text'} value={form[field.key]||''} onChange={event=>setForm({...form,[field.key]:event.target.value})}/>}</label>)}
      {resource==='users'&&['manager','lead','worker'].includes(selectedRole)&&<div className="process-assignment"><span>Công đoạn *</span><div className="process-check-list">{processes.map(process=><label key={process.id}><input type="checkbox" checked={selectedProcessIds.includes(String(process.id))} onChange={()=>toggleProcess(String(process.id))}/><span>{process.process_name}</span></label>)}</div></div>}
      <label><span>Trạng thái</span><select value={form.status||'active'} onChange={event=>setForm({...form,status:event.target.value})}><option value="active">Đang dùng</option><option value="inactive">Ngừng dùng</option></select></label>
    </div><div className="modal-actions"><button onClick={()=>setEditing(null)}>Hủy</button><button className="primary" disabled={saving} onClick={()=>void save()}>{saving?'Đang lưu...':'Lưu thay đổi'}</button></div></div></div>}
  </div>;
}
export default MasterData;
