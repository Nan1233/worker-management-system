# KTC iPhone direct profile delivery

Production profile endpoint:

`https://worker-management-system-2-5jqv.onrender.com/api/mobile/ios-profile`

Optional install helper page:

`https://worker-management-system-2-5jqv.onrender.com/api/mobile/ios`

## Recommended QR

Point the QR directly to `/api/mobile/ios-profile`. iPhone Camera/Safari can hand a correctly served `.mobileconfig` to iOS because the endpoint returns:

`Content-Type: application/x-apple-aspen-config`

The route deliberately does **not** use `Content-Disposition: attachment`, because the goal is native profile hand-off rather than a generic file download.

Apple still requires user confirmation for installation. After download, the user installs from Settings → Profile Downloaded.

In-app browsers such as Zalo control their own WebView behaviour. The backend now serves the correct native MIME response, but a third-party app can still decide not to hand configuration profiles to iOS. For the most reliable flow, scan the QR with the iPhone Camera or open the link in Safari.
