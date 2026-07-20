# Automatic monthly Excel update

Flow:

1. Lead/manager approves reports.
2. Backend automatically rebuilds the affected monthly workbook.
3. Approved report update/delete also rebuilds the old/new affected month.
4. Workbook is written to a temporary file and atomically renamed over the old file.
5. Download endpoint only streams the existing file; it never rebuilds during download.

Environment:

Windows local backend:

EXCEL_EXPORT_ROOT=D:\BaoCaoSanXuat
EXCEL_STAGE_FOLDER_NAME=Cắt lồng

Result:

D:\BaoCaoSanXuat\2026\Cắt lồng\Bao-cao-san-xuat-07-2026.xlsx

Render persistent disk example:

EXCEL_EXPORT_ROOT=/var/data/BaoCaoSanXuat
EXCEL_STAGE_FOLDER_NAME=Cắt lồng

A Render service cannot write directly to a Windows D: drive on another computer.
