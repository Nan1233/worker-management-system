# Excel monthly export speed optimization

The monthly export now uses a persistent file cache.

- A lightweight `COUNT/MAX(updated_at)` query checks whether the monthly file is current.
- Cache HIT: the existing XLSX file is streamed immediately.
- Cache MISS: the month is rebuilt once, and a `.meta.json` sidecar is written.
- Date filtering uses indexed ranges instead of `DATE_FORMAT(work_date, ...)`.
- Response header `X-Excel-Cache` returns `HIT` or `MISS`.

Storage layout:

`EXCEL_EXPORT_ROOT/<year>/<stage>/Bao-cao-san-xuat-MM-YYYY.xlsx`

Example:

`D:\BaoCaoSanXuat\2026\Cắt lồng\Bao-cao-san-xuat-07-2026.xlsx`
