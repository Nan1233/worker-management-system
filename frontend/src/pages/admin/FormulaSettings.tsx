import { useCallback, useEffect, useMemo, useState } from 'react';
import { Calculator, CheckCircle2, Clock3, Gauge, Palette, RefreshCw, Save, Search, Target, TriangleAlert } from 'lucide-react';
import api from '../../services/api';
import { getApiError } from '../../utils/apiError';
import { usePermissions } from '../../hooks/usePermissions';

type ProductRule = { id:number; process_id:number; process_code:string; process_name:string; product_code:string; standard_output:number; exclude_kqd_from_tt:number };
type FormulaScope = { scope_code:string; process_id:number|null; process_code:string|null; process_name:string; effective_from:string|null; effective_to:string|null; apply_training_percent:number; output_formula:string; output_per_hour_formula:string; achievement_formula:string; ng_rate_formula:string; actual_time_formula:string; threshold_red:number; threshold_orange:number; threshold_yellow:number; threshold_green:number; version_no:number; inherits_global?:number };
type FormulaResponse = { products:ProductRule[]; scopes:FormulaScope[]; processes?:Array<{id:number;process_code:string;process_name:string}>; history?:unknown[] };
type FormulaFieldKey = 'output_formula'|'output_per_hour_formula'|'achievement_formula'|'ng_rate_formula'|'actual_time_formula';

const formulaLabels:Record<FormulaFieldKey,{title:string;description:string;placeholder:string;example:string}>= {
 output_formula:{title:'Sản lượng quy đổi',description:'Công thức xác định sản lượng dùng cho các bước tính tiếp theo.',placeholder:'Ví dụ: Sản lượng nhập × % học việc',example:'Sản lượng nhập × % học việc'},
 output_per_hour_formula:{title:'Sản lượng / giờ',description:'Công thức tính sản lượng trên một giờ thực tế.',placeholder:'Ví dụ: Sản lượng quy đổi ÷ Thời gian thực tế',example:'Sản lượng quy đổi ÷ Thời gian thực tế'},
 achievement_formula:{title:'Tỷ lệ đạt',description:'Công thức so sánh sản lượng/giờ với định mức.',placeholder:'Ví dụ: Sản lượng / giờ ÷ Định mức',example:'Sản lượng / giờ ÷ Định mức'},
 ng_rate_formula:{title:'Tỷ lệ NG',description:'Công thức xác định tỷ lệ lỗi của báo cáo.',placeholder:'Ví dụ: NG ÷ (OK + NG)',example:'NG ÷ (OK + NG)'},
 actual_time_formula:{title:'Thời gian thực tế',description:'Nguồn/công thức xác định thời gian thực tế để tính năng suất.',placeholder:'Ví dụ: Thời gian làm việc − Tổng thời gian trừ',example:'Thời gian làm việc − Tổng thời gian trừ'}
};

const expressionForCode=(key:FormulaFieldKey,value:string)=>{
 const maps:Record<FormulaFieldKey,Record<string,string>>={
  output_formula:{ENTERED_X_TRAINING:'Sản lượng nhập × % học việc',ENTERED_OUTPUT:'Sản lượng công nhân nhập',OK_PLUS_NG:'OK + NG',OK_X_TRAINING:'OK × % học việc'},
  output_per_hour_formula:{ADJUSTED_OUTPUT_DIV_ACTUAL_TIME:'Sản lượng quy đổi ÷ Thời gian thực tế',ENTERED_OUTPUT_DIV_ACTUAL_TIME:'Sản lượng nhập ÷ Thời gian thực tế'},
  achievement_formula:{OUTPUT_PER_HOUR_DIV_STANDARD:'Sản lượng / giờ ÷ Định mức'},
  ng_rate_formula:{NG_DIV_OK_PLUS_NG:'NG ÷ (OK + NG)',NG_DIV_ENTERED_OUTPUT:'NG ÷ Sản lượng nhập'},
  actual_time_formula:{DATABASE_SNAPSHOT:'Thời gian thực tế đã lưu trong hệ thống',WORKING_MINUS_DEDUCTION:'Thời gian làm việc − Tổng thời gian trừ',MACHINE_LINES_SUM:'Tổng thời gian các máy'}
 };
 return maps[key]?.[value] || value || '';
};

const codeFromExpression=(key:FormulaFieldKey,value:string)=>{
 const normalized=value.trim().replace(/\s+/g,' ').replace(/\//g,'÷').replace(/-/g,'−');
 const aliases:Record<FormulaFieldKey,Record<string,string>>={
  output_formula:{'Sản lượng nhập × % học việc':'ENTERED_X_TRAINING','Sản lượng công nhân nhập':'ENTERED_OUTPUT','OK + NG':'OK_PLUS_NG','OK × % học việc':'OK_X_TRAINING'},
  output_per_hour_formula:{'Sản lượng quy đổi ÷ Thời gian thực tế':'ADJUSTED_OUTPUT_DIV_ACTUAL_TIME','Sản lượng nhập ÷ Thời gian thực tế':'ENTERED_OUTPUT_DIV_ACTUAL_TIME'},
  achievement_formula:{'Sản lượng / giờ ÷ Định mức':'OUTPUT_PER_HOUR_DIV_STANDARD'},
  ng_rate_formula:{'NG ÷ (OK + NG)':'NG_DIV_OK_PLUS_NG','NG ÷ Sản lượng nhập':'NG_DIV_ENTERED_OUTPUT'},
  actual_time_formula:{'Thời gian thực tế đã lưu trong hệ thống':'DATABASE_SNAPSHOT','Thời gian làm việc − Tổng thời gian trừ':'WORKING_MINUS_DEDUCTION','Tổng thời gian các máy':'MACHINE_LINES_SUM'}
 };
 const direct=Object.entries(aliases[key]).find(([label])=>label.replace(/\s+/g,' ')===normalized)?.[1];
 if(direct)return direct;
 if(/^[A-Z0-9_]+$/.test(normalized))return normalized;
 return null;
};

export default function FormulaSettings(){
 const {can}=usePermissions(); const canEdit=can('FORMULA_EDIT');
 const [data,setData]=useState<FormulaResponse>({products:[],scopes:[]}); const [selectedScope,setSelectedScope]=useState('GLOBAL'); const [draft,setDraft]=useState<FormulaScope|null>(null);
 const [loading,setLoading]=useState(true); const [saving,setSaving]=useState(false); const [savingId,setSavingId]=useState<number|null>(null); const [error,setError]=useState(''); const [success,setSuccess]=useState(''); const [query,setQuery]=useState(''); const [productProcessId,setProductProcessId]=useState('');
 const load=useCallback(async()=>{setLoading(true);setError('');try{const response=await api.get('/formula-settings');const next=response.data.data as FormulaResponse;setData(next);const scope=next.scopes.find(item=>item.scope_code==='GLOBAL')||next.scopes[0];setSelectedScope(scope?.scope_code||'GLOBAL');setDraft(scope?{...scope}:null);}catch(e){setError(getApiError(e,'Không thể tải công thức').message);}finally{setLoading(false);}},[]);
 useEffect(()=>{void load();},[load]);
 const chooseScope=(code:string)=>{const scope=data.scopes.find(item=>item.scope_code===code);setSelectedScope(code);setDraft(scope?{...scope}:null);setSuccess('');setError('');};
 const setField=<K extends keyof FormulaScope>(key:K,value:FormulaScope[K])=>setDraft(prev=>prev?{...prev,[key]:value}:prev);
 const save=async()=>{if(!draft)return;setSaving(true);setError('');setSuccess('');try{const keys:FormulaFieldKey[]=['output_formula','output_per_hour_formula','achievement_formula','ng_rate_formula','actual_time_formula'];const normalized:Record<string,string>={};for(const key of keys){const code=codeFromExpression(key,String(draft[key]||''));if(!code)throw new Error(`Công thức “${formulaLabels[key].title}” không hợp lệ. Hãy nhập đúng dạng gợi ý bên dưới ô.`);normalized[key]=code;}const payload={...draft,...normalized};const response=await api.put(`/formula-settings/scopes/${encodeURIComponent(draft.scope_code)}`,payload);const next=response.data.data as {scopes:FormulaScope[]};setData(prev=>({...prev,scopes:next.scopes}));const scope=next.scopes.find(item=>item.scope_code===draft.scope_code)||draft;setDraft({...scope});setSuccess('Đã lưu công thức và ngưỡng.');}catch(e){setError(getApiError(e,'Không thể lưu công thức').message);}finally{setSaving(false);}};
 const reset=async()=>{if(!draft||!window.confirm('Khôi phục công thức mặc định cho phạm vi này?'))return;setSaving(true);setError('');setSuccess('');try{const response=await api.delete(`/formula-settings/scopes/${encodeURIComponent(draft.scope_code)}`);const next=response.data.data as {scopes:FormulaScope[]};setData(prev=>({...prev,scopes:next.scopes}));const scope=next.scopes.find(item=>item.scope_code===draft.scope_code);setDraft(scope?{...scope}:null);setSuccess('Đã khôi phục cấu hình mặc định.');}catch(e){setError(getApiError(e,'Không thể khôi phục').message);}finally{setSaving(false);}};
 const processes=useMemo(()=>Array.from(new Map(data.products.map(r=>[r.process_id,{id:r.process_id,name:r.process_name}])).values()),[data.products]);
 const visibleProducts=useMemo(()=>data.products.filter(r=>{const text=`${r.process_name} ${r.product_code}`.toLowerCase();return(!productProcessId||String(r.process_id)===productProcessId)&&text.includes(query.toLowerCase());}),[data.products,query,productProcessId]);
 const updateProduct=async(row:ProductRule,exclude:boolean)=>{setSavingId(row.id);setError('');try{await api.put(`/formula-settings/products/${row.id}`,{exclude_kqd_from_tt:exclude});setData(prev=>({...prev,products:prev.products.map(x=>x.id===row.id?{...x,exclude_kqd_from_tt:exclude?1:0}:x)}));}catch(e){setError(getApiError(e,'Không thể lưu quy tắc KQD').message);}finally{setSavingId(null);}};
 const formulaFields=(Object.keys(formulaLabels) as FormulaFieldKey[]);
 if(loading)return <div className="formula-page"><div className="formula-empty">Đang tải công thức...</div></div>;
 return <div className="formula-page">
  <header className="formula-header"><div><span className="formula-eyebrow">CẤU HÌNH TÍNH TOÁN</span><h1>Công thức & ngưỡng</h1><p>Chia nhỏ từng thành phần tính toán. Công thức được nhập trực tiếp bằng bàn phím, không cần chọn từ danh sách.</p></div><button className="formula-refresh" onClick={()=>void load()}><RefreshCw size={16}/> Cập nhật</button></header>
  {error&&<div className="formula-error">{error}</div>}{success&&<div className="formula-success"><CheckCircle2 size={17}/>{success}</div>}
  <section className="formula-card formula-scope-card"><div className="formula-card-title"><div><span className="formula-section-kicker">PHẠM VI ÁP DỤNG</span><h2>Công thức theo công đoạn</h2><p>Chọn phạm vi cần cấu hình; riêng ô công thức bên dưới cho phép gõ trực tiếp.</p></div><select value={selectedScope} onChange={e=>chooseScope(e.target.value)}>{data.scopes.map(scope=><option key={scope.scope_code} value={scope.scope_code}>{scope.process_name}{scope.inherits_global?' — kế thừa':''}</option>)}</select></div>
   {draft&&<><div className="formula-period-card"><label><span>Hiệu lực từ</span><input type="date" value={draft.effective_from||''} onChange={e=>setField('effective_from',e.target.value||null)}/></label><label><span>Hiệu lực đến</span><input type="date" min={draft.effective_from||undefined} value={draft.effective_to||''} onChange={e=>setField('effective_to',e.target.value||null)}/></label><div><strong>{draft.process_name}</strong><small>Để trống ngày nếu muốn áp dụng không giới hạn ở phía đó.</small></div></div>
    <div className="formula-section-grid">{formulaFields.map((key,index)=>{const item=formulaLabels[key];const Icon=[Calculator,Gauge,Target,TriangleAlert,Clock3][index];return <article className="formula-input-card" key={key}><div className="formula-input-icon"><Icon size={20}/></div><div className="formula-input-copy"><span>{item.title}</span><p>{item.description}</p><input aria-label={item.title} value={expressionForCode(key,draft[key])} placeholder={item.placeholder} onChange={e=>setField(key,e.target.value)}/><small>Ví dụ: {item.example}</small></div></article>;})}</div>
    <label className="formula-training"><input type="checkbox" checked={Boolean(draft.apply_training_percent)} onChange={e=>setField('apply_training_percent',e.target.checked?1:0)}/><span><strong>Áp dụng % học việc</strong><small>Nhân sản lượng theo tỷ lệ học việc trước khi tính năng suất.</small></span></label>
    <section className="formula-thresholds"><div className="formula-subtitle"><div><span className="formula-section-kicker">NGƯỠNG MÀU</span><h3>Tỷ lệ đạt</h3></div><Palette size={19}/></div><div className="threshold-grid">{([['red','Đỏ dưới','threshold_red'],['orange','Cam từ','threshold_orange'],['yellow','Vàng từ','threshold_yellow'],['green','Xanh từ','threshold_green']] as const).map(([tone,label,key])=><label className={`threshold ${tone}`} key={key}><span>{label}</span><div><input type="number" value={draft[key]} onChange={e=>setField(key,Number(e.target.value))}/><b>%</b></div></label>)}</div><div className="threshold-legend"><i className="red"/> &lt; {draft.threshold_red}% <i className="orange"/> {draft.threshold_red}–&lt;{draft.threshold_orange}% <i className="yellow"/> {draft.threshold_orange}–&lt;{draft.threshold_yellow}% <i className="green"/> ≥ {draft.threshold_green}%</div></section>
    {canEdit&&<div className="formula-actions"><button className="secondary" disabled={saving} onClick={()=>void reset()}>Khôi phục mặc định</button><button className="primary" disabled={saving} onClick={()=>void save()}><Save size={16}/>{saving?'Đang lưu...':'Lưu thay đổi'}</button></div>}
   </>}
  </section>
  <section className="formula-card"><div className="formula-card-title"><div><span className="formula-section-kicker">KQD / TT</span><h2>Quy tắc KQD theo sản phẩm</h2><p>Thiết lập riêng việc loại KQD khỏi TT cho từng mã sản phẩm.</p></div><div className="formula-filters"><select value={productProcessId} onChange={e=>setProductProcessId(e.target.value)}><option value="">Tất cả công đoạn</option>{processes.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><label><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Tìm mã sản phẩm..."/></label></div></div><div className="formula-table-wrap"><table className="formula-table"><thead><tr><th>Công đoạn</th><th>Mã sản phẩm</th><th>Định mức</th><th>Cách tính TT</th><th>Loại KQD</th></tr></thead><tbody>{visibleProducts.map(row=>{const exclude=Boolean(row.exclude_kqd_from_tt);return <tr key={row.id}><td>{row.process_name}</td><td><strong>{row.product_code}</strong></td><td>{Number(row.standard_output||0).toLocaleString('vi-VN')}</td><td><code>{exclude?'OK + NG, loại KQD':'OK + toàn bộ NG'}</code></td><td><label className="formula-switch"><input type="checkbox" checked={exclude} disabled={savingId===row.id} onChange={e=>void updateProduct(row,e.target.checked)}/><span/></label></td></tr>})}</tbody></table></div></section>
 </div>;
}
