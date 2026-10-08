const db = require("../config/db");

// CVK keeps its 10-type catalogue (migrations 039/040).
const CVK_DEDUCTION_TYPES = [
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

// GC uses the full canonical 16 types (backend/config/ktcTemplateMasterData.js,
// GC.deductions, same order). This self-healing catalogue previously held only 10
// and deactivated the other 6 on every request, undoing migration 053.
// keepCode: the row already exists under its own code; only status/sort are set.
const GC_DEDUCTION_TYPES = [
    { code: "THIEU_SAN_LUONG", name: "Thiếu sản lượng", sort: 1 },
    { code: "BAT_MAY_XET_MAY", name: "Bật máy, xét máy", sort: 2, keepCode: true },
    { code: "CHUYEN_MA", name: "Chuyển mã", sort: 3 },
    { code: "CHINH_MAY", name: "Chỉnh máy", sort: 4 },
    { code: "CHO_CHINH_MAY", name: "Chờ chỉnh máy", sort: 5, keepCode: true },
    { code: "MAT_DIEN", name: "Mất điện", sort: 6, keepCode: true },
    { code: "MAT_KHI", name: "Mất khí", sort: 7, keepCode: true },
    { code: "CHO_HANG", name: "Chờ hàng", sort: 8, keepCode: true },
    { code: "BAO_DUONG_MAY", name: "bảo dưỡng máy", sort: 9, keepCode: true },
    { code: "NGHI_GIAI_LAO", name: "Nghỉ giải lao", sort: 10 },
    { code: "GIAO_CA", name: "Giao ca", sort: 11 },
    { code: "DUNG_MAY_HO_TRO", name: "Dừng máy đi hỗ trợ", sort: 12 },
    { code: "GIAT_CS_CAN_CS_TUOT_TAI_PP_GL", name: "Giặt cs/cân cs, tuốt-tái pp, GL", sort: 13 },
    { code: "5S", name: "5s", sort: 14 },
    { code: "HOC_VIEC_DAO_TAO", name: "Học việc, đào tạo", sort: 15 },
    { code: "DI_MUON_VE_SOM", name: "Đi muộn về sớm", sort: 16 },
];

const CATALOGUE_BY_PROCESS_CODE = { GC: GC_DEDUCTION_TYPES, CVK: CVK_DEDUCTION_TYPES };
const catalogueFor = (processCode) => CATALOGUE_BY_PROCESS_CODE[String(processCode || "").toUpperCase()] || CVK_DEDUCTION_TYPES;
const namesOf = (catalogue) => catalogue.map((item) => item.name.toLowerCase());

async function resolveProcess(processId) {
    const requestedId = Number(processId);
    const [exactRows] = await db.promise().query(
        `SELECT id, UPPER(TRIM(COALESCE(process_code, ''))) AS process_code, status
           FROM processes
          WHERE id = ?
          LIMIT 1`,
        [requestedId],
    );

    const exact = exactRows?.[0];
    if (exact && ["GC", "CVK"].includes(exact.process_code)) {
        if (exact.process_code === "CVK" && String(exact.status || "active").toLowerCase() !== "active") {
            await db.promise().query(`UPDATE processes SET status = 'active' WHERE id = ?`, [exact.id]);
        }
        return { id: Number(exact.id), code: exact.process_code, source: "id" };
    }

    // Never assume that the AUTO_INCREMENT id of CVK is 60006. Resolve the
    // physical process by its canonical code instead.
    if (requestedId === 60006) {
        const [codeRows] = await db.promise().query(
            `SELECT id, UPPER(TRIM(COALESCE(process_code, ''))) AS process_code, status
               FROM processes
              WHERE UPPER(TRIM(COALESCE(process_code, ''))) = 'CVK'
              ORDER BY id
              LIMIT 1`,
        );
        const byCode = codeRows?.[0];
        if (byCode) {
            if (String(byCode.status || "active").toLowerCase() !== "active") {
                await db.promise().query(`UPDATE processes SET status = 'active' WHERE id = ?`, [byCode.id]);
            }
            return { id: Number(byCode.id), code: "CVK", source: "code" };
        }

        // Migration 034 should create CVK, but self-heal it here as well so a
        // partially migrated TiDB database cannot leave the worker form empty.
        await db.promise().query(
            `INSERT INTO processes (process_code, process_name, status)
             VALUES ('CVK', 'Công việc khác (Không theo mã sản phẩm)', 'active')`,
        );
        const [createdRows] = await db.promise().query(
            `SELECT id, UPPER(TRIM(COALESCE(process_code, ''))) AS process_code
               FROM processes
              WHERE UPPER(TRIM(COALESCE(process_code, ''))) = 'CVK'
              ORDER BY id DESC
              LIMIT 1`,
        );
        const created = createdRows?.[0];
        if (created) return { id: Number(created.id), code: "CVK", source: "created" };
    }

    return null;
}

async function ensureCanonicalDeductionTypes(processId) {
    const process = await resolveProcess(processId);
    if (!process) {
        console.warn("[KTC][DEDUCTION] process not resolved", JSON.stringify({ requestedProcessId: Number(processId) }));
        return null;
    }

    const catalogue = catalogueFor(process.code);
    const placeholders = catalogue.map(() => "?").join(",");
    await db.promise().query(
        `UPDATE deduction_types
            SET status = 'inactive'
          WHERE process_id = ?
            AND LOWER(TRIM(COALESCE(deduction_name, ''))) NOT IN (${placeholders})`,
        [process.id, ...namesOf(catalogue)],
    );

    for (const item of catalogue) {
        const [existingRows] = await db.promise().query(
            `SELECT id
               FROM deduction_types
              WHERE process_id = ?
                AND LOWER(TRIM(COALESCE(deduction_name, ''))) = LOWER(TRIM(?))
              ORDER BY id
              LIMIT 1`,
            [process.id, item.name],
        );

        if (existingRows.length) {
            if (item.keepCode) {
                await db.promise().query(
                    `UPDATE deduction_types SET sort_order = ?, status = 'active' WHERE id = ?`,
                    [item.sort, existingRows[0].id],
                );
            } else {
                await db.promise().query(
                    `UPDATE deduction_types
                        SET deduction_code = ?, sort_order = ?, status = 'active'
                      WHERE id = ?`,
                    [item.code, item.sort, existingRows[0].id],
                );
            }
        } else {
            await db.promise().query(
                `INSERT INTO deduction_types
                    (process_id, deduction_code, deduction_name, sort_order, status)
                 VALUES (?, ?, ?, ?, 'active')`,
                [process.id, item.code, item.name, item.sort],
            );
        }
    }

    return process;
}

const Deduction = {
    async getByProcess(process_id) {
        const requestedId = Number(process_id);
        const process = await ensureCanonicalDeductionTypes(requestedId);
        const effectiveProcessId = process?.id ?? requestedId;
        const catalogue = catalogueFor(process?.code);
        const placeholders = catalogue.map(() => "?").join(",");

        return new Promise((resolve, reject) => {
            const sql = `
                SELECT d.id, d.deduction_code, d.deduction_name, d.sort_order
                FROM deduction_types d
                INNER JOIN processes p ON p.id = d.process_id
                WHERE d.process_id = ?
                  AND d.status = 'active'
                  AND UPPER(TRIM(COALESCE(p.process_code, ''))) IN ('GC', 'CVK')
                  AND LOWER(TRIM(COALESCE(d.deduction_name, ''))) IN (${placeholders})
                ORDER BY d.sort_order ASC, d.id ASC
            `;
            const params = [effectiveProcessId, ...namesOf(catalogue)];

            db.query(sql, params, (err, rows) => {
                if (err) return reject(err);
                console.info("[KTC][DEDUCTION] resolved", JSON.stringify({
                    requestedProcessId: requestedId,
                    effectiveProcessId,
                    processCode: process?.code ?? null,
                    processSource: process?.source ?? null,
                    returned: Array.isArray(rows) ? rows.length : 0,
                }));
                resolve(rows);
            });
        });
    },

    getById(id) {
        return new Promise((resolve, reject) => {
            const sql = `SELECT * FROM deduction_types WHERE id = ?`;
            db.query(sql, [id], (err, result) => {
                if (err) return reject(err);
                resolve(result[0]);
            });
        });
    }
};

module.exports = Deduction;
