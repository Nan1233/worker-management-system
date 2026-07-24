const db = require("../config/db");

const queryDatabase = (
    sql,
    params = []
) => {
    return new Promise(
        (resolve, reject) => {
            db.query(
                sql,
                params,
                (error, rows) => {
                    if (error) {
                        return reject(error);
                    }

                    resolve(rows);
                }
            );
        }
    );
};
// =====================================================
// LẤY REPORT ĐỂ ĐỒNG BỘ GOOGLE SHEET
// LẤY CẢ PENDING + APPROVED
// ƯU TIÊN BẢN GHI MỚI NHẤT
// =====================================================

exports.getApprovedReportsByDate = (date)=>{

    return new Promise((resolve,reject)=>{


        const sql = `

        SELECT

            pr.id,

            pr.work_date,

            pr.shift,

            pr.machine_no,

            pr.product_name,


            w.worker_code,

            u.full_name,


            p.process_name,


            pr.standard_output,

            pr.actual_output,


            pr.tt_ok,

            pr.tt_ng,


            pr.note,


            pr.status,

            pr.created_at



        FROM production_reports pr



        INNER JOIN workers w

        ON pr.worker_id = w.id



        INNER JOIN users u

        ON w.user_id = u.id



        LEFT JOIN processes p

        ON pr.process_id = p.id



        WHERE pr.work_date = ?



        AND pr.status = approved



        ORDER BY

            w.worker_code ASC,

            pr.created_at DESC



        `;



        db.query(

            sql,

            [date],

            (err,rows)=>{


                if(err)

                    return reject(err);



                /*
                    xử lý trùng mã NV

                    ví dụ:
                    W001 approved
                    W001 pending

                    => giữ cả 2

                    nhưng nếu cùng trạng thái
                    => lấy bản mới nhất
                */


                const map = {};

                const result = [];



                rows.forEach(item=>{


                    const key =
                    item.worker_code;



                    const statusKey =
                    key + "_" + item.status;



                    if(!map[statusKey]){


                        map[statusKey]=true;


                        result.push(item);


                    }


                });



                resolve(result);


            }


        );


    });


};
const getReportsByDate = async (date) => {
    const reports = await queryDatabase(
        `
            SELECT
                pr.*,
                w.worker_code,
                w.training_percent,
                u.full_name,
                p.process_name

            FROM production_reports AS pr

            INNER JOIN workers AS w
                ON w.id = pr.worker_id

            INNER JOIN users AS u
                ON u.id = w.user_id

            LEFT JOIN processes AS p
                ON p.id = pr.process_id

            WHERE pr.work_date = ?

            ORDER BY
                pr.work_date ASC,
                pr.worker_id ASC,
                pr.id ASC
        `,
        [date]
    );

    if (reports.length === 0) {
        return [];
    }

    const reportIds =
        reports.map(report =>
            Number(report.id)
        );

    const placeholders =
        reportIds
            .map(() => "?")
            .join(", ");

    const [
        deductionRows,
        defectRows
    ] = await Promise.all([
        queryDatabase(
            `
                SELECT
                    detail.report_id,
                    detail.deduction_type_id,
                    type.deduction_code,
                    type.deduction_name,
                    detail.hours

                FROM production_report_deductions AS detail

                INNER JOIN deduction_types AS type
                    ON type.id = detail.deduction_type_id

                WHERE detail.report_id IN (${placeholders})

                ORDER BY
                    detail.report_id ASC,
                    type.sort_order ASC,
                    type.id ASC
            `,
            reportIds
        ),

        queryDatabase(
            `
                SELECT
                    detail.report_id,
                    detail.defect_type_id,
                    type.defect_code,
                    type.defect_name,
                    detail.quantity

                FROM production_report_defects AS detail

                INNER JOIN defect_types AS type
                    ON type.id = detail.defect_type_id

                WHERE detail.report_id IN (${placeholders})
                  AND type.status = 'active'

                ORDER BY
                    detail.report_id ASC,
                    type.sort_order ASC,
                    type.id ASC
            `,
            reportIds
        )
    ]);

    const deductionsMap =
        new Map();

    deductionRows.forEach(item => {
        const reportId =
            Number(item.report_id);

        if (!deductionsMap.has(reportId)) {
            deductionsMap.set(reportId, []);
        }

        deductionsMap
            .get(reportId)
            .push({
                deduction_type_id:
                    Number(
                        item.deduction_type_id
                    ),

                deduction_code:
                    item.deduction_code || "",

                deduction_name:
                    item.deduction_name || "",

                hours:
                    Number(item.hours) || 0
            });
    });

    const defectsMap =
        new Map();

    defectRows.forEach(item => {
        const reportId =
            Number(item.report_id);

        if (!defectsMap.has(reportId)) {
            defectsMap.set(reportId, []);
        }

        defectsMap
            .get(reportId)
            .push({
                defect_type_id:
                    Number(
                        item.defect_type_id
                    ),

                defect_code:
                    item.defect_code || "",

                defect_name:
                    item.defect_name || "",

                quantity:
                    Number(item.quantity) || 0
            });
    });

    return reports.map(report => {
        const reportId =
            Number(report.id);

        return {
            ...report,

            deductions:
                deductionsMap.get(reportId) ||
                [],

            defects:
                defectsMap.get(reportId) ||
                []
        };
    });
};

const getAllApprovedReportsForSheet =
    async () => {
        const reports =
    await queryDatabase(
        `
            SELECT
                pr.*,
                w.worker_code,
                w.training_percent,
                u.full_name,
                p.process_name

            FROM production_reports AS pr

            INNER JOIN workers AS w
                ON w.id = pr.worker_id

            INNER JOIN users AS u
                ON u.id = w.user_id

            LEFT JOIN processes AS p
                ON p.id = pr.process_id

            WHERE pr.status = 'approved'

            ORDER BY
                pr.work_date ASC,
                pr.worker_id ASC,
                pr.id ASC
        `
    );
        if (reports.length === 0) {
            return [];
        }

        const reportIds =
            reports.map(report =>
                Number(report.id)
            );

        const placeholders =
            reportIds
                .map(() => "?")
                .join(", ");

        const [
            deductionRows,
            defectRows
        ] = await Promise.all([
            queryDatabase(
                `
                    SELECT
                        detail.report_id,
                        detail.deduction_type_id,
                        type.process_id,
                        type.deduction_code,
                        type.deduction_name,
                        type.sort_order,
                        detail.hours

                    FROM production_report_deductions AS detail

                    INNER JOIN deduction_types AS type
                        ON type.id =
                           detail.deduction_type_id

                    WHERE detail.report_id
                        IN (${placeholders})

                    ORDER BY
                        detail.report_id ASC,
                        type.sort_order ASC,
                        type.id ASC
                `,
                reportIds
            ),

            queryDatabase(
                `
                    SELECT
                        detail.report_id,
                        detail.defect_type_id,
                        type.defect_code,
                        type.defect_name,
                        detail.quantity

                    FROM production_report_defects AS detail

                    INNER JOIN defect_types AS type
                        ON type.id =
                           detail.defect_type_id

                    WHERE detail.report_id
                        IN (${placeholders})
                      AND type.status = 'active'

                    ORDER BY
                        detail.report_id ASC,
                        type.sort_order ASC,
                        type.id ASC
                `,
                reportIds
            )
        ]);

        const deductionsMap =
            new Map();

        deductionRows.forEach(item => {
            const reportId =
                Number(item.report_id);

            if (
                !deductionsMap.has(
                    reportId
                )
            ) {
                deductionsMap.set(
                    reportId,
                    []
                );
            }

            deductionsMap
                .get(reportId)
                .push({
                    deduction_type_id:
                        Number(item.deduction_type_id),

                    process_id:
                        Number(item.process_id),

                    deduction_code:
                        item.deduction_code || "",

                    deduction_name:
                        item.deduction_name || "",

                    sort_order:
                        Number(item.sort_order) || 0,

                    hours:
                        Number(item.hours) || 0
                });
        });

        const defectsMap =
            new Map();

        defectRows.forEach(item => {
            const reportId =
                Number(item.report_id);

            if (
                !defectsMap.has(
                    reportId
                )
            ) {
                defectsMap.set(
                    reportId,
                    []
                );
            }

            defectsMap
                .get(reportId)
                .push({
                    defect_type_id:
                        Number(item.defect_type_id),

                    defect_code:
                        item.defect_code || "",

                    defect_name:
                        item.defect_name || "",

                    quantity:
                        Number(item.quantity) || 0
                });
        });

        return reports.map(report => {
            const reportId =
                Number(report.id);

            return {
                ...report,

                deductions:
                    deductionsMap.get(
                        reportId
                    ) || [],

                defects:
                    defectsMap.get(
                        reportId
                    ) || []
            };
        });
    };
    exports.getAllApprovedReportsForSheet =
    getAllApprovedReportsForSheet;