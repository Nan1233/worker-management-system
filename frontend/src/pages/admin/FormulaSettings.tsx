import { useEffect, useMemo, useState } from 'react';
import api from '../../services/api';
import { getApiError } from '../../utils/apiError';
import './FormulaSettings.css';

type ProductRule = {
  id:number; process_id:number; process_code:string; process_name:string;
  product_code:string; standard_output:number; exclude_kqd_from_tt:number;
};
type FormulaScope = {
  scope_code:string; process_id:number|null; process_code:string|null; process_name:string;
  apply_training_percent:number; output_formula:string; output_per_hour_formula:string;
  achievement_formula:string; ng_rate_formula:string; actual_time_formula:string;
  threshold_red:number; threshold_orange:number; threshold_yellow:number; threshold_green:number;
  version_no:number; inherits_global?:number;
};
type Option = { value:string; label:string };
type FormulaResponse = {
  products:ProductRule[]; scopes:FormulaScope[];
  formulaOptions:Record<string,Option[]>;
};

const percent = (value:number) => `${Number(value || 0).toLocaleString('vi-VN')}%`;

export default function FormulaSettings(){
  const [data,setData]=useState<FormulaResponse>({products:[],scopes:[],formulaOptions:{}});
  const [selectedScope,setSelectedScope]=useState('GLOBAL');
  const [draft,setDraft]=useState<FormulaScope|null>(null);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [savingId,setSavingId]=useState<number|null>(null);
  const [error,setError]=useState('');
  const [success,setSuccess]=useState('');
  const [query,setQuery]=useState('');
  const [productProcessId,setProductProcessId]=useState('');

  const load=async()=>{
    setLoading(true); setError('');
    try{
      const response=await api.get('/formula-settings');
      const next=response.data.data as FormulaResponse;
      setData(next);
      const scope=next.scopes.find(item=>item.scope_code===selectedScope)||next.scopes[0];
      setSelectedScope(scope?.scope_code||'GLOBAL');
      setDraft(scope?{...scope}:null);
    }catch(e){setError(getApiError(e,'Không thể tải cài đặt công thức').message);}
    finally{setLoading(false);}
  };
  useEffect(()=>{void load();},[]);

  const chooseScope=(scopeCode:string)=>{
    setSelectedScope(scopeCode);
    const scope=data.scopes.find(item=>item.scope_code===scopeCode);
    setDraft(scope?{...scope}:null);
    setSuccess(''); setError('');
  };

  const save=async()=>{
    if(!draft)return;
    setSaving(true);setError('');setSuccess('');
    try{
      const response=await api.put(`/formula-settings/scopes/${encodeURIComponent(draft.scope_code)}`,draft);
      const next=response.data.data as {scopes:FormulaScope[]};
      setData(prev=>({...prev,scopes:next.scopes}));
      const scope=next.scopes.find(item=>item.scope_code===draft.scope_code)||draft;
      setDraft({...scope});
      setSuccess('Đã lưu. Web và Excel sẽ dùng cấu hình mới cho lần tính/xuất tiếp theo.');
    }catch(e){setError(getApiError(e,'Không thể lưu cài đặt công thức').message);}
    finally{setSaving(false);}
  };

  const reset=async()=>{
    if(!draft||!window.confirm('Khôi phục công thức mặc định cho phạm vi này?'))return;
    setSaving(true);setError('');setSuccess('');
    try{
      const response=await api.delete(`/formula-settings/scopes/${encodeURIComponent(draft.scope_code)}`);
      const next=response.data.data as {scopes:FormulaScope[]};
      setData(prev=>({...prev,scopes:next.scopes}));
      const scope=next.scopes.find(item=>item.scope_code===draft.scope_code);
      setDraft(scope?{...scope}:null);
      setSuccess('Đã khôi phục cấu hình mặc định.');
    }catch(e){setError(getApiError(e,'Không thể khôi phục cài đặt').message);}
    finally{setSaving(false);}
  };

  const processes=useMemo(()=>Array.from(new Map(data.products.map(r=>[r.process_id,{id:r.process_id,name:r.process_name}])).values()),[data.products]);
  const visibleProducts=useMemo(()=>data.products.filter(r=>{
    const text=`${r.process_name} ${r.product_code}`.toLowerCase();
    return (!productProcessId||String(r.process_id)===productProcessId)&&text.includes(query.toLowerCase());
  }),[data.products,query,productProcessId]);

  const updateProduct=async(row:ProductRule,exclude:boolean)=>{
    setSavingId(row.id);setError('');
    try{
      await api.put(`/formula-settings/products/${row.id}`,{exclude_kqd_from_tt:exclude});
      setData(prev=>({...prev,products:prev.products.map(x=>x.id===row.id?{...x,exclude_kqd_from_tt:exclude?1:0}:x)}));
    }catch(e){setError(getApiError(e,'Không thể lưu quy tắc KQD').message);}
    finally{setSavingId(null);}
  };

  const setField=<K extends keyof FormulaScope>(key:K,value:FormulaScope[K])=>setDraft(prev=>prev?{...prev,[key]:value}:prev);
  const option=(key:string)=>data.formulaOptions[key]||[];
  const previewInput=1000;
  const previewTraining=80;
  const previewAdjusted=draft?.apply_training_percent?previewInput*previewTraining/100:previewInput;
  const previewPerHour=previewAdjusted/8;
  const previewAchievement=previewPerHour/100*100;

  if(loading)return <div className="formula-page"><div className="formula-empty">Đang tải cài đặt...</div></div>;

  return <div className="formula-page">
    <header className="formula-header"><div><h1>Cài đặt công thức & ngưỡng màu</h1><p>Quản lý cách tính sản lượng, hiệu suất và màu cảnh báo cho web và Excel.</p></div></header>
    {error&&<div className="formula-error">{error}</div>}
    {success&&<div className="formula-success">{success}</div>}

    <section className="formula-card formula-config-card">
      <div className="formula-card-title"><div><h2>Công thức theo công đoạn</h2><p>Cấu hình chung hoặc ghi đè riêng cho từng công đoạn.</p></div>
        <select value={selectedScope} onChange={e=>chooseScope(e.target.value)}>{data.scopes.map(scope=><option key={scope.scope_code} value={scope.scope_code}>{scope.process_name}{scope.inherits_global?' — đang kế thừa':''}</option>)}</select>
      </div>
      {draft&&<>
        <div className="formula-grid">
          <label><span>Tổng sản lượng</span><select value={draft.output_formula} onChange={e=>setField('output_formula',e.target.value)}>{option('output_formula').map(item=><option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label><span>Sản phẩm/giờ</span><select value={draft.output_per_hour_formula} onChange={e=>setField('output_per_hour_formula',e.target.value)}>{option('output_per_hour_formula').map(item=><option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label><span>Tỷ lệ đạt</span><select value={draft.achievement_formula} onChange={e=>setField('achievement_formula',e.target.value)}>{option('achievement_formula').map(item=><option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label><span>Tỷ lệ NG</span><select value={draft.ng_rate_formula} onChange={e=>setField('ng_rate_formula',e.target.value)}>{option('ng_rate_formula').map(item=><option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label><span>Thời gian thực tế</span><select value={draft.actual_time_formula} onChange={e=>setField('actual_time_formula',e.target.value)}>{option('actual_time_formula').map(item=><option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label className="formula-check"><input type="checkbox" checked={Boolean(draft.apply_training_percent)} onChange={e=>setField('apply_training_percent',e.target.checked?1:0)}/><span>Áp dụng % học việc vào sản lượng quy đổi</span></label>
        </div>

        <div className="formula-thresholds">
          <h3>Ngưỡng màu tỷ lệ đạt</h3>
          <div className="threshold-grid">
            <label className="threshold red"><span>Đỏ dưới</span><input type="number" value={draft.threshold_red} onChange={e=>setField('threshold_red',Number(e.target.value))}/><b>%</b></label>
            <label className="threshold orange"><span>Cam từ</span><input type="number" value={draft.threshold_red} disabled/><b>%</b></label>
            <label className="threshold yellow"><span>Vàng từ</span><input type="number" value={draft.threshold_orange} onChange={e=>setField('threshold_orange',Number(e.target.value))}/><b>%</b></label>
            <label className="threshold green"><span>Xanh từ</span><input type="number" value={draft.threshold_yellow} onChange={e=>setField('threshold_yellow',Number(e.target.value))}/><b>%</b></label>
            <label className="threshold blue"><span>Xanh dương từ</span><input type="number" value={draft.threshold_green} onChange={e=>setField('threshold_green',Number(e.target.value))}/><b>%</b></label>
          </div>
          <div className="threshold-legend"><i className="red"></i>&lt; {percent(draft.threshold_red)} <i className="orange"></i>{percent(draft.threshold_red)}–&lt;{percent(draft.threshold_orange)} <i className="yellow"></i>{percent(draft.threshold_orange)}–&lt;{percent(draft.threshold_yellow)} <i className="green"></i>{percent(draft.threshold_yellow)}–&lt;{percent(draft.threshold_green)} <i className="blue"></i>≥ {percent(draft.threshold_green)}</div>
        </div>

        <div className="formula-preview"><div><span>Ví dụ sản lượng nhập</span><strong>{previewInput.toLocaleString('vi-VN')}</strong></div><div><span>% học việc</span><strong>{previewTraining}%</strong></div><div><span>Sản lượng quy đổi</span><strong>{previewAdjusted.toLocaleString('vi-VN')}</strong></div><div><span>SP/giờ (8 giờ)</span><strong>{previewPerHour.toLocaleString('vi-VN')}</strong></div><div><span>Tỷ lệ đạt (ĐM 100)</span><strong>{previewAchievement.toFixed(1)}%</strong></div></div>
        <div className="formula-actions"><button className="secondary" disabled={saving} onClick={()=>void reset()}>Khôi phục mặc định</button><button className="primary" disabled={saving} onClick={()=>void save()}>{saving?'Đang lưu...':'Lưu thay đổi'}</button></div>
      </>}
    </section>

    <section className="formula-card">
      <div className="formula-card-title"><div><h2>Quy tắc KQD theo mã sản phẩm</h2><p>Giữ cấu hình loại KQD khỏi TT theo từng mã sản phẩm.</p></div><div className="formula-filters"><select value={productProcessId} onChange={e=>setProductProcessId(e.target.value)}><option value="">Tất cả công đoạn</option>{processes.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Tìm mã sản phẩm..." /></div></div>
      <div className="formula-table-wrap"><table className="formula-table"><thead><tr><th>Công đoạn</th><th>Mã sản phẩm</th><th>Định mức</th><th>Công thức TT</th><th>Không tính KQD</th></tr></thead><tbody>{visibleProducts.map(row=>{const exclude=Boolean(row.exclude_kqd_from_tt);return <tr key={row.id}><td>{row.process_name}</td><td><strong>{row.product_code}</strong></td><td>{Number(row.standard_output||0).toLocaleString('vi-VN')}</td><td><code>{exclude?'OK + NG trừ KQD':'OK + toàn bộ NG'}</code></td><td><label className="formula-switch"><input type="checkbox" checked={exclude} disabled={savingId===row.id} onChange={e=>void updateProduct(row,e.target.checked)}/><span></span></label></td></tr>;})}</tbody></table></div>
    </section>
  </div>;
}
