const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();

const IOS_PROFILE_PATH = path.resolve(
  __dirname,
  "..",
  "mobile",
  "ios",
  "KTC-Production-Control.mobileconfig",
);

/**
 * Public iPhone configuration-profile delivery endpoint.
 *
 * Keep this endpoint unauthenticated: it is intended to be opened directly
 * from iPhone Camera/Safari or shared as a QR/Zalo link before the user has
 * signed in to KTC.
 *
 * Apple recognises a configuration profile delivered over HTTPS when the
 * response MIME type is application/x-apple-aspen-config.  Do not return a
 * SPA page, JSON wrapper, redirect or Content-Disposition attachment here.
 */
router.get("/ios-profile", (_req, res, next) => {
  fs.access(IOS_PROFILE_PATH, fs.constants.R_OK, (error) => {
    if (error) {
      error.status = 503;
      error.code = "IOS_PROFILE_UNAVAILABLE";
      error.isPublic = true;
      error.message = "Hồ sơ cài đặt iPhone hiện chưa sẵn sàng";
      return next(error);
    }

    res.setHeader("Content-Type", "application/x-apple-aspen-config");
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("X-KTC-Mobile-Profile", "ios-webclip-v1");

    return res.sendFile(IOS_PROFILE_PATH);
  });
});

/**
 * Tiny human-readable helper page.  QR codes should normally point directly
 * to /api/mobile/ios-profile; this page is useful when the link is shared in
 * chat and the user wants an explicit install button.
 */
router.get("/ios", (req, res) => {
  const profileUrl = `${req.protocol}://${req.get("host")}/api/mobile/ios-profile`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  return res.send(`<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
  <meta name="color-scheme" content="light dark" />
  <title>Cài KTC trên iPhone</title>
  <style>
    :root { font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color-scheme: light dark; }
    body { margin:0; min-height:100dvh; display:grid; place-items:center; background:#0b1118; color:#f4f7fa; }
    main { width:min(92vw,440px); box-sizing:border-box; padding:28px; border-radius:22px; background:#121a24; border:1px solid #314153; }
    h1 { margin:0 0 10px; font-size:24px; }
    p { margin:0 0 22px; color:#b8c2ce; line-height:1.55; }
    a { display:flex; min-height:52px; align-items:center; justify-content:center; border-radius:14px; background:#4f8fcf; color:#fff; font-weight:700; text-decoration:none; }
    small { display:block; margin-top:18px; color:#8290a0; line-height:1.45; }
  </style>
</head>
<body>
  <main>
    <h1>KTC Production Control</h1>
    <p>Cài biểu tượng KTC lên màn hình chính iPhone bằng hồ sơ cấu hình của công ty.</p>
    <a href="${profileUrl}">Tải hồ sơ cài đặt KTC</a>
    <small>Sau khi iPhone nhận hồ sơ, mở Cài đặt → Hồ sơ đã tải về → Cài đặt. Apple luôn yêu cầu người dùng xác nhận bước cài đặt.</small>
  </main>
</body>
</html>`);
});

module.exports = router;
