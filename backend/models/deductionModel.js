const db = require("../config/db");

const GC_DEDUCTION_TYPES = [
    { code: "THIEU_SAN_LUONG", name: "Thiếu sản lượng", sort: 1 },
    { code: "CHUYEN_MA", name: "Chuyển mã", sort: 2 },
    { code: "CHINH_MAY", name: "Chỉnh máy", sort: 3 },
    { code: "NGHI_GIAI_LAO", name: "Nghỉ giải lao", sort: 4 },
    { code: "GIAO_CA", name: "Giao ca", sort: 5 },
    { code: "DUNG_MAY_HO_TRO", name: "Dừng máy đi hỗ trợ", sort: 6 },
    { code: "GIAT_CS_CAN_CS_TUOT_TAI_PP_GL", name: "Giặt cs/cân cs, tuốt-tái pp, GL", sort: 7 },
    { code: "5S", name: "5s", sort: 8 },
    { code: "HOC_VIEC_DAO_TAO", name: "Học việc, đào tạo", sort: 9 },
    { code: "DI_MUON_VE_SOM", name: "Đi muộn về sớm", sort: 10 },
];

const GC_DEDUCTION_NAMES = GC_DEDUCTION_TYPES.map((item) => item.name);

async function ensureGcDeductionTypes(processId) {
    const [processRows] = await db.promise().query(
        `SELECT id
           FROM processes
          WHERE id = ?
            AND UPPER(TRIM(COALESCE(process_code, ''))) = 'GC'
          LIMIT 1`,
        [processId],
    );
    if (!processRows.length) return;

    // Repair the master data if migration 038 has not yet been applied to the
    // connected TiDB database. This is intentionally idempotent and only runs
    // for GC, so existing production history is preserved.
    const placeholders = GC_DEDUCTION_NAMES.map(() => "?").join(",");
    await db.promise().query(
        `UPDATE deduction_types
            SET status = 'inactive'
          WHERE process_id = ?
            AND LOWER(TRIM(COALESCE(deduction_name, ''))) NOT IN (${placeholders})`,
        [processId, ...GC_DEDUCTION_NAMES.map((name) => name.toLowerCase())],
    );

    for (const item of GC_DEDUCTION_TYPES) {
        const [existingRows] = await db.promise().query(
            `SELECT id
               FROM deduction_types
              WHERE process_id = ?
                AND LOWER(TRIM(COALESCE(deduction_name, ''))) = LOWER(TRIM(?))
              ORDER BY id
              LIMIT 1`,
            [processId, item.name],
        );

        if (existingRows.length) {
            await db.promise().query(
                `UPDATE deduction_types
                    SET deduction_code = ?, sort_order = ?, status = 'active'
                  WHERE id = ?`,
                [item.code, item.sort, existingRows[0].id],
            );
        } else {
            await db.promise().query(
                `INSERT INTO deduction_types
                    (process_id, deduction_code, deduction_name, sort_order, status)
                 VALUES (?, ?, ?, ?, 'active')`,
                [processId, item.code, item.name, item.sort],
            );
        }
    }
}

const Deduction = {

    // =====================================================
    // LẤY TRỪ GIỜ THEO CÔNG ĐOẠN
    // GET /api/processes/:id/deductions
    // =====================================================
    // GC có danh mục Trừ giờ cố định theo business rule.
    // Nếu DB còn thiếu các row mới, tự bổ sung trước khi trả dữ liệu.
    async getByProcess(process_id) {
        const processId = Number(process_id);
        await ensureGcDeductionTypes(processId);

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

            const params = [processId, ...GC_DEDUCTION_NAMES.map((name) => name.toLowerCase())];

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
