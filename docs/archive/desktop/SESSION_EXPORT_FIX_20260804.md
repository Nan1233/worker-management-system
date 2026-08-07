# KTC session and Excel export stabilization

- Every authenticated Axios request is stamped with an auth generation.
- Responses from an older account generation are rejected as canceled responses.
- Failed login always clears all current and legacy auth keys and session caches.
- Exact username login remains higher priority than worker-code lookup.
- Heavy ExcelJS generation is disabled on Render unless ALLOW_RENDER_HEAVY_EXCEL is explicitly enabled.
- Excel worker OOM is converted to a clear DESKTOP_EXCEL_REQUIRED response.
