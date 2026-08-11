# KTC Android (Capacitor 8)

## Mục tiêu
Bọc frontend React/Vite hiện tại thành ứng dụng Android native shell bằng Capacitor, vẫn sử dụng backend Render/TiDB hiện tại.

## Yêu cầu
- Node.js 22+
- Android Studio 2025.2.1+
- Android SDK API 24+ (khuyến nghị API 36 hiện tại)

## Build APK debug nhanh trên Windows
Từ root project:

```cmd
mobile\android\BUILD_ANDROID_DEBUG.cmd
```

APK đầu ra:

```text
frontend\android\app\build\outputs\apk\debug\app-debug.apk
```

## Lệnh thủ công
```cmd
npm run install:all
npm run android:add
npm run android:sync
npm run android:open
```

Sau mỗi lần sửa frontend:

```cmd
npm run android:sync
```

Build APK:

```cmd
npm run build:android
```

Build AAB release (cần cấu hình keystore/signing trong Android Studio trước khi phát hành):

```cmd
npm run build:android:aab
```

## Ghi chú KTC
Backend CORS đã cho phép `https://localhost`, origin của Capacitor Android khi `androidScheme=https`. Service worker PWA được bỏ qua khi chạy trong native shell để tránh cache chồng với bundle app.
