# Download Safety / Chrome

## XLSX
The API serves XLSX as the official OpenXML MIME type, uses attachment disposition,
no-store caching and `X-Content-Type-Options: nosniff`.

## EXE
Chrome/Windows SmartScreen reputation warnings for a newly published executable
cannot be removed by HTTP headers. Official Windows releases must be code-signed.

Set `CSC_LINK` and `CSC_KEY_PASSWORD` for electron-builder and run:
`npm run release:signing-check`

Serve official releases over HTTPS and publish a SHA-256 checksum. Do not disable
Chrome Safe Browsing or Windows SmartScreen.
