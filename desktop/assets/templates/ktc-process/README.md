# Mẫu báo cáo Excel gốc theo công đoạn

Desktop đọc trực tiếp các workbook `.xlsx` trong thư mục này. 7 mẫu: `01_MAU_MAI.xlsx`, `02_MAU_DO.xlsx`, `03_MAU_KIEM_1.xlsx`, `04_MAU_KIEM_2.xlsx`, `05_MAU_CAN.xlsx`, `06_MAU_EP.xlsx`, `07_MAU_XLBV.xlsx`.

**Tệp nhị phân XLSX phải được cài từ bộ mẫu gốc người dùng đã xác nhận**; không thay thế bằng mẫu Gia công, không tự lấy mẫu nhầm công đoạn. Các tệp XLSX chưa được đưa vào repository qua GitHub connector (text-only).

Tải bộ `KTC_7_Form_Excel_Goc_Theo_Cong_Doan.zip` từ hội thoại và giải nén ra một thư mục. Sau đó:

```bat
cd /d F:\VSCode\worker-management-system\desktop
node scripts\installProcessTemplates.cjs "C:\duong-dan\KTC_Mau_Excel_Theo_Cong_Doan"
npm start
```

Mẫu là form 50 hàng trống có style, bảng báo cáo động có thể nhiều hơn 50 dòng; không dùng mẫu như nguồn dữ liệu. Gia công, SX3 và CVK hiện dùng form xây dựng bởi ExcelJS cho đến khi có mẫu Excel công ty tương ứng.

Không tùy tiện sửa vị trí hàng tiêu đề/cột: các ánh xạ nằm ở `electron/originalProcessExcelTemplate.cjs`. File mẫu có thể được lưu vào thư mục nêu trên trước khi đóng gói bản EXE.
