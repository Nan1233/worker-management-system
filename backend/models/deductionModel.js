const db = require("../config/db");

const GC_DEDUCTION_NAMES = [
    "Thiếu sản lượng",
    "Chuyển mã",
    "Chỉnh máy",
    "Nghỉ giải lao",
    "Giao ca",
    "Dừng máy đi hỗ trợ",
    "Giặt cs/cân cs, tuốt-tái pp, GL",
    "5s",
    "Học việc, đào tạo",
    "Đi muộn về sớm",
];

const Deduction = {

    // =====================================================
    // LẤY TRỪ GIỜ THEO CÔNG ĐOẠN
    // GET /api/processes/:id/deductions
    // =====================================================
    // GC có danh mục Trừ giờ cố định theo business rule.
    // Lọc ngay tại DB query để cache/backend/frontend không thể
    // trả lại các loại GC cũ đã từng tồn tại trong master data.
    getByProcess(process_id) {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT
                    d.id,
                    d.deduction_code,
                    d.deduction_name,
                    d.sort_order
                FROM deduction_types d
                LEFT JOIN processes p ON p.id = d.process_id
                WHERE d.process_id = ?
                  AND d.status = 'active'
                  AND (
                    UPPER(TRIM(COALESCE(p.process_code, ''))) <> 'GC'
                    OR LOWER(TRIM(COALESCE(d.deduction_name, ''))) IN (
                        ${GC_DEDUCTION_NAMES.map(() => "?").join(",")}
                    )
                  )
                ORDER BY d.sort_order ASC, d.id ASC
            `;

            const params = [process_id, ...GC_DEDUCTION_NAMES.map((name) => name.toLowerCase())];

            db.query(sql, params, (err, rows) => {
                if (err) return reject(err);
                resolve(rows);
            });
        });
    },

    // =====================================================
    // LẤY CHI TIẾT TRỪ GIỜ
    // =====================================================
    getById(id) {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT *
                FROM deduction_types
                WHERE id = ?
            `;

            db.query(sql, [id], (err, result) => {
                if (err) return reject(err);
                resolve(result[0]);
            });
        });
    }
};

module.exports = Deduction;
