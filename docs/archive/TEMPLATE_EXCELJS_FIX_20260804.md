# Sửa lỗi ExcelJS đọc `sheets` undefined

Hai template chính thức được giữ nguyên nội dung, sheet, ô, công thức và định dạng, nhưng phần XML bên trong được chuẩn hóa từ tiền tố `x:` sang namespace SpreadsheetML mặc định để ExcelJS 4.4.0 đọc ổn định trong Electron.

`monthlyWorkbookLocal.cjs` cũng kiểm tra rõ đường dẫn, kích thước file và số worksheet trước khi ghi dữ liệu. Khi template lỗi, thông báo sẽ nêu đúng tên file thay vì `Cannot read properties of undefined (reading 'sheets')`.
