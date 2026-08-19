import { useEffect, useMemo, useState } from "react";
const APK_URL = "/downloads/ktc-production-control.apk";
const IOS_PROFILE_URL = "/KTC-Production-Control.mobileconfig";

function detectPlatform() {
  const ua = navigator.userAgent || "";
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  return { isIOS, isAndroid };
}

export default function MobileDownload() {
  const [installed, setInstalled] = useState(false);
  const platform = useMemo(() => detectPlatform(), []);

  useEffect(() => {
    const media = window.matchMedia("(display-mode: standalone)");
    const update = () => {
      const standaloneNavigator = Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
      setInstalled(media.matches || standaloneNavigator);
    };
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    if (!platform.isAndroid || installed) return;
    const timer = window.setTimeout(() => {
      window.location.assign(APK_URL);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [installed, platform.isAndroid]);

  return (
    <main className="mobile-download-page">
      <section className="mobile-download-card" aria-labelledby="mobile-download-title">
        <div className="mobile-download-brand">K</div>
        <p className="mobile-download-kicker">KTC (HANOI) CO., LTD</p>
        <h1 id="mobile-download-title">KTC Production Control</h1>
        <p className="mobile-download-subtitle">Cài nhanh trên điện thoại, không cần App Store hoặc Google Play.</p>

        {installed && <div className="mobile-download-success">✓ KTC đang chạy như một ứng dụng web.</div>}

        {platform.isAndroid && (
          <div className="mobile-download-panel">
            <h2>Android</h2>
            <p>Đang mở tải APK… nếu trình duyệt không tự tải, hãy bấm nút bên dưới.</p>
            <a className="mobile-download-primary" href={APK_URL} download>
              Tải KTC APK
            </a>
            <small>Nếu Android hỏi quyền, cho phép trình duyệt cài ứng dụng từ nguồn này.</small>
          </div>
        )}

        {platform.isIOS && (
          <div className="mobile-download-panel">
            <h2>iPhone / iPad</h2>
            <p>KTC dùng PWA để cài miễn phí, không cần Apple Developer và không cần IPA.</p>
            <ol>
              <li>Mở trang này bằng Safari.</li>
              <li>Nhấn <strong>Chia sẻ</strong>.</li>
              <li>Chọn <strong>Thêm vào Màn hình chính</strong>.</li>
              <li>Bật <strong>Mở dưới dạng ứng dụng web</strong> rồi chọn <strong>Thêm</strong>.</li>
            </ol>
            <a className="mobile-download-primary" href="/login">Mở KTC ngay</a>
            <a className="mobile-download-secondary" href={IOS_PROFILE_URL}>
              Tải cấu hình WebClip (tùy chọn)
            </a>
            <small>WebClip chỉ tạo lối tắt; PWA là cách miễn phí và ổn định nhất trên iPhone.</small>
          </div>
        )}

        {!platform.isAndroid && !platform.isIOS && (
          <div className="mobile-download-panel">
            <h2>Điện thoại</h2>
            <p>Mở liên kết này trên Android hoặc iPhone để nhận đúng hướng dẫn cài đặt.</p>
            <div className="mobile-download-actions">
              <a className="mobile-download-primary" href={APK_URL}>Android APK</a>
              <a className="mobile-download-secondary" href="/login">Mở KTC Web/PWA</a>
            </div>
          </div>
        )}

        <a className="mobile-download-back" href="/login">← Vào hệ thống KTC</a>
      </section>
    </main>
  );
}
