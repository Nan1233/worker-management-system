const express = require('express');
const router = express.Router();

// Công thức không còn là chức năng quản lý công khai của hệ thống.
// Giữ mount cũ để deployment không lỗi import, nhưng mọi endpoint đều bị vô hiệu hóa.
router.use((_req, res) => {
  res.status(404).json({
    success: false,
    code: 'FORMULA_FEATURE_REMOVED',
    message: 'Chức năng công thức đã được loại bỏ khỏi hệ thống',
  });
});

module.exports = router;
