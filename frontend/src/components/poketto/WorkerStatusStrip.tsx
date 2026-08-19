import { Wifi, WifiOff, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

export function WorkerStatusStrip() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  return (
    <div className="mb-4 flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground" role="status">
      {online ? <Wifi className="size-3.5 text-emerald-600"/> : <WifiOff className="size-3.5 text-amber-600"/>}
      <span>{online ? "Đang kết nối" : "Đang ngoại tuyến"}</span>
      <span className="ml-auto inline-flex items-center gap-1"><ShieldCheck className="size-3.5"/> KTC Worker</span>
    </div>
  );
}
