import { useMemo, useRef, useState } from "react";
import { Download, FileSpreadsheet, RefreshCw, Upload } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import api from "../../services/api";
import { usePermissions } from "../../hooks/usePermissions";
import { getApiError } from "../../utils/apiError";

type Resource = "machines" | "standards" | "deductions" | "defects";

const labels: Record<Resource, string> = {
  machines: "Máy móc",
  standards: "Sản phẩm",
  deductions: "Trừ giờ",
  defects: "Lỗi",
};

export default function MasterDataTransferActions() {
  const location = useLocation();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const resource = useMemo<Resource | null>(() => {
    const match = location.pathname.match(/\/master\/(machines|standards|deductions|defects)(?:\/|$)/);
    if (!match) return null;
    return match[1] as Resource;
  }, [location.pathname]);

  if (!resource || !can("MASTER_VIEW")) return null;
  const label = labels[resource];

  const exportData = async () => {
    setBusy(true);
    setMessage("");
    try {
      const response = await api.get(`/admin/master/transfer/export/${resource}`, { responseType: "blob" });
      const blob = new Blob([response.data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `KTC_${resource}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setMessage(`Đã xuất dữ liệu ${label}.`);
    } catch (error) {
      setMessage(getApiError(error, "Không thể xuất dữ liệu").message);
    } finally {
      setBusy(false);
    }
  };

  const importData = () => inputRef.current?.click();

  const onFile = async (file: File | null) => {
    if (!file) return;
    if (!/\.xlsx$/i.test(file.name)) {
      setMessage("Chỉ hỗ trợ file Excel .xlsx");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(reader.error || new Error("Không đọc được file"));
        reader.readAsDataURL(file);
      });
      const response = await api.post(`/admin/master/transfer/import/${resource}`, { file_base64: base64 });
      setMessage(response.data?.message || `Đã nhập dữ liệu ${label}.`);
      window.setTimeout(() => navigate(0), 500);
    } catch (error) {
      setMessage(getApiError(error, "Không thể nhập dữ liệu").message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="master-transfer-actions" style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, flexWrap: "wrap", margin: "0 auto 12px", maxWidth: 1440 }}>
      {message && <span style={{ fontSize: 13, color: message.toLowerCase().includes("không") ? "#b91c1c" : "#15803d", marginRight: "auto" }}>{message}</span>}
      <button type="button" disabled={busy} onClick={() => void exportData()} style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 38, padding: "0 13px", border: "1px solid #cfe0f5", borderRadius: 8, background: "#fff", color: "#176fe1", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
        <Download size={15} /> Xuất Excel
      </button>
      {can("MASTER_EDIT") && <>
        <button type="button" disabled={busy} onClick={importData} style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 38, padding: "0 13px", border: "1px solid #176fe8", borderRadius: 8, background: "#176fe8", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          <Upload size={15} /> Nhập Excel
        </button>
        <input ref={inputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => void onFile(event.target.files?.[0] || null)} style={{ display: "none" }} />
      </>}
      {busy && <RefreshCw size={15} style={{ animation: "spin 1s linear infinite" }} />}
    </div>
  );
}
