import { useEffect, useMemo, useState } from "react";
import { api } from "../../services/api";
import { getStoredUser } from "../../utils/authStorage";

type WorkerProcess = {
  id: number;
  code: string;
  name: string;
};

type WorkerProfile = {
  worker_id?: number;
  user_id?: number;
  worker_code?: string | null;
  username?: string;
  full_name?: string;
  role?: string;
  phone?: string | null;
  department?: string | null;
  position?: string | null;
  training_percent?: number | string | null;
  status?: string;
  processes?: WorkerProcess[];
  process_names?: string;
};

function displayRole(role?: string) {
  const labels: Record<string, string> = {
    admin: "Quản trị viên",
    manager: "Quản lý",
    lead: "Tổ trưởng",
    worker: "Nhân viên"
  };
  return labels[String(role || "").toLowerCase()] || role || "—";
}

export default function Profile() {
  const storedUser = useMemo(() => getStoredUser(), []);
  const [profile, setProfile] = useState<WorkerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        setLoading(true);
        setError("");

        if (storedUser?.role === "worker") {
          const response = await api.get("/workers/me");
          if (active) setProfile(response.data?.data || null);
          return;
        }

        if (active) {
          setProfile({
            user_id: storedUser?.id,
            worker_code: storedUser?.worker_code,
            username: storedUser?.username,
            full_name: storedUser?.full_name,
            role: storedUser?.role
          });
        }
      } catch (requestError) {
        console.error("LOAD PROFILE ERROR:", requestError);
        if (active) {
          setProfile({
            user_id: storedUser?.id,
            worker_code: storedUser?.worker_code,
            username: storedUser?.username,
            full_name: storedUser?.full_name,
            role: storedUser?.role
          });
          setError("Không thể tải đầy đủ hồ sơ từ máy chủ. Đang hiển thị thông tin phiên đăng nhập.");
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    return () => { active = false; };
  }, [storedUser]);

  const trainingPercent = profile?.training_percent;
  const processNames = profile?.processes?.length
    ? profile.processes.map((item) => item.name || item.code).filter(Boolean).join(", ")
    : profile?.process_names || "—";

  return (
    <main style={{ maxWidth: 980, margin: "0 auto", padding: "clamp(16px, 3vw, 32px)" }}>
      <header style={{ marginBottom: 24 }}>
        <p style={{ margin: 0, color: "#64748b", fontSize: 14, fontWeight: 600 }}>TÀI KHOẢN</p>
        <h1 style={{ margin: "6px 0 8px", fontSize: "clamp(24px, 4vw, 34px)", color: "#0f172a" }}>Hồ sơ cá nhân</h1>
        <p style={{ margin: 0, color: "#64748b" }}>Thông tin nhận diện và phân công đang áp dụng cho tài khoản của bạn.</p>
      </header>

      {error && (
        <div role="alert" style={{ marginBottom: 16, padding: "12px 14px", border: "1px solid #f59e0b", borderRadius: 10, background: "#fffbeb", color: "#92400e" }}>
          {error}
        </div>
      )}

      <section style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, boxShadow: "0 8px 24px rgba(15, 23, 42, 0.06)", overflow: "hidden" }}>
        <div style={{ padding: "20px clamp(16px, 3vw, 28px)", borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
          <strong style={{ display: "block", fontSize: 20, color: "#0f172a" }}>{profile?.full_name || storedUser?.full_name || "Người dùng"}</strong>
          <span style={{ display: "block", marginTop: 4, color: "#64748b" }}>{displayRole(profile?.role || storedUser?.role)}</span>
        </div>

        {loading ? (
          <div style={{ padding: 28, color: "#64748b" }}>Đang tải hồ sơ…</div>
        ) : (
          <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 0, margin: 0 }}>
            {[
              ["Mã nhân viên", profile?.worker_code || storedUser?.worker_code || "—"],
              ["Tên đăng nhập", profile?.username || storedUser?.username || "—"],
              ["Bộ phận", profile?.department || "—"],
              ["Vị trí", profile?.position || "—"],
              ["% học việc", trainingPercent === null || trainingPercent === undefined || trainingPercent === "" ? "—" : `${Number(trainingPercent)}%`],
              ["Trạng thái", profile?.status === "inactive" ? "Ngừng hoạt động" : "Đang hoạt động"],
              ["Công đoạn", processNames],
              ["Số điện thoại", profile?.phone || "—"]
            ].map(([label, value]) => (
              <div key={String(label)} style={{ padding: "18px clamp(16px, 3vw, 28px)", borderBottom: "1px solid #eef2f7" }}>
                <dt style={{ marginBottom: 6, color: "#64748b", fontSize: 13, fontWeight: 600 }}>{label}</dt>
                <dd style={{ margin: 0, color: "#0f172a", fontWeight: 600, overflowWrap: "anywhere" }}>{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>
    </main>
  );
}
