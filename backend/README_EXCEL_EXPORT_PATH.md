# Excel export path

Local Windows backend:

```env
EXCEL_EXPORT_ROOT=D:\\BaoCaoSanXuat
EXCEL_STAGE_FOLDER_NAME=Cắt lồng
```

Output:

```text
D:\BaoCaoSanXuat\2026\Cắt lồng\Bao-cao-san-xuat-07-2026.xlsx
```

Render cannot write to the D: drive on a user's PC. With a Render Persistent Disk mounted at `/var/data` use:

```env
EXCEL_EXPORT_ROOT=/var/data/BaoCaoSanXuat
EXCEL_STAGE_FOLDER_NAME=Cắt lồng
```
