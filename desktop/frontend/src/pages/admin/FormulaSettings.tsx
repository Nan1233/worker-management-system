import { useEffect, useMemo, useState } from 'react';
import api from '../../services/api';
import { getApiError } from '../../utils/apiError';
import './FormulaSettings.css';

type ProductRule = {
  id:number;
  process_id:number;
  process_code:string;
  process_name:string;
  work_type:string;
  product_code:string;
  standard_output:number;
  exclude_kqd_from_tt:number;
};

export default function FormulaSettings(){
  const [rows,setRows]=useState<ProductRule[]>([]);
  const [loading,setLoading]=useState(true);
  const [savingId,setSavingId]=useState<number|null>(null);
  const [error,setError]=useState('');
  const [query,setQuery]=useState('');
  const [processId,setProcessId]=useState('');

  const load=async()=>{
    setLoading(true);setError('');
    try{const r=await api.get('/formula-settings');setRows(r.data.data||[]);}
    catch(e){setError(getApiError(e,'Không thể tải công thức').message);}
    finally{setLoading(false);}
  };
  useEffect(()=>{void load();},[]);

  const processes=useMemo(()=>Array.from(new Map(rows.map(r=>[r.process_id,{id:r.process_id,name:r.process_name}])).values()),[rows]);
  const visible=useMemo(()=>rows.filter(r=>{
    const text=`${r.process_name} ${r.product_code} ${r.work_type}`.toLowerCase();
    return (!processId||String(r.process_id)===processId)&&text.includes(query.toLowerCase());
  }),[rows,query,processId]);

  const update=async(row:ProductRule,exclude:boolean)=>{
    setSavingId(row.id);setError('');
    try{
      await api.put(`/formula-settings/products/${row.id}`,{exclude_kqd_from_tt:exclude});
      setRows(prev=>prev.map(x=>x.id===row.id?{...x,exclude_kqd_from_tt:exclude?1:0}:x));
    }catch(e){setError(getApiError(e,'Không thể lưu công thức').message);}
    finally{setSavingId(null);}
  };

  return <div className="formula-page">
    <header className="formula-header">
      <div><h1>Quản lý công thức đầu ra</h1><p>Cấu hình cách tính sản lượng theo từng mã sản phẩm.</p></div>
    </header>

    <section className="formula-summary">
      <div><span>Công thức TT</span><strong>TT = OK + NG được tính</strong></div>
      <div><span>Định mức</span><strong>Số nguyên dương</strong></div>
      <div><span>KQD</span><strong>Cấu hình theo mã sản phẩm</strong></div>
    </section>

    <section className="formula-card">
      <div className="formula-card-title">
        <div><h2>Quy tắc KQD theo mã sản phẩm</h2><p>Bật “Không tính KQD” cho những mã sản phẩm mà KQD chỉ dùng theo dõi lỗi và không cộng vào TT.</p></div>
        <div className="formula-filters">
          <select value={processId} onChange={e=>setProcessId(e.target.value)}><option value="">Tất cả công đoạn</option>{processes.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Tìm mã sản phẩm..." />
        </div>
      </div>
      {error&&<div className="formula-error">{error}</div>}
      {loading?<div className="formula-empty">Đang tải...</div>:visible.length===0?<div className="formula-empty">Không có mã sản phẩm phù hợp.</div>:
      <div className="formula-table-wrap"><table className="formula-table"><thead><tr><th>Công đoạn</th><th>Mã sản phẩm</th><th>Định mức</th><th>Công thức áp dụng</th><th>Không tính KQD</th></tr></thead><tbody>{visible.map(row=>{
        const exclude=Boolean(row.exclude_kqd_from_tt);
        return <tr key={row.id}><td>{row.process_name}</td><td><strong>{row.product_code}</strong><small>{row.work_type}</small></td><td>{Number(row.standard_output||0).toLocaleString('vi-VN')}</td><td><code>{exclude?'TT = OK + NG (trừ KQD)':'TT = OK + toàn bộ NG'}</code></td><td><label className="formula-switch"><input type="checkbox" checked={exclude} disabled={savingId===row.id} onChange={e=>void update(row,e.target.checked)}/><span></span></label></td></tr>;
      })}</tbody></table></div>}
    </section>
  </div>;
}
