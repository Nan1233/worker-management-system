const ProductionTemp =
    require("../models/productionTempModel");

const GoogleSheetService =
    require("../services/googleSheetService");


// =====================================================
// HÀM CHUYỂN SỐ AN TOÀN
// =====================================================

const toPositiveInteger = (value) => {

    const numberValue =
        Number(value);


    if (
        !Number.isInteger(numberValue)
        ||
        numberValue <= 0
    ) {

        return null;

    }


    return numberValue;

};


// =====================================================
// WORKER TẠO BÁO CÁO TEMP
// POST /api/production-temp
// =====================================================

exports.createTempReport = async (
    req,
    res
) => {

    try {

        const workerId =
            toPositiveInteger(
                req.user?.worker_id
            );


        const processId =
            toPositiveInteger(
                req.body?.process_id
            );


        if (!workerId) {

            return res.status(400).json({

                success: false,

                message:
                    "Tài khoản chưa có thông tin nhân viên"

            });

        }


        if (!processId) {

            return res.status(400).json({

                success: false,

                message:
                    "Công đoạn không hợp lệ"

            });

        }


        if (!req.body.work_date) {

            return res.status(400).json({

                success: false,

                message:
                    "Thiếu ngày làm việc"

            });

        }


        if (!req.body.shift) {

            return res.status(400).json({

                success: false,

                message:
                    "Thiếu ca làm việc"

            });

        }


        const defects =
            Array.isArray(
                req.body.defects
            )

                ? req.body.defects

                : [];


        const deductions =
            Array.isArray(
                req.body.deductions
            )

                ? req.body.deductions

                : [];


        /*
            Không lấy worker_id từ body.

            worker_id được lấy từ token đăng nhập
            để tránh công nhân gửi báo cáo thay người khác.
        */

        const data = {

            ...req.body,

            worker_id:
                workerId,

            process_id:
                processId,

            defects:
                undefined,

            deductions:
                undefined

        };


        /*
            Tạo báo cáo tạm trước.

            Hàm create chỉ insert vào
            production_reports_temp.
        */

        const tempId =
            await ProductionTemp.create(
                data
            );


        /*
            Frontend gửi:

            {
                defect_name: "KQD dập lại",
                quantity: 10
            }

            Model sẽ dùng processId + defect_name
            để tìm defect_type_id.
        */

        await ProductionTemp.createDefects(

            tempId,

            processId,

            defects

        );


        /*
            Frontend gửi:

            {
                deduction_name: "Số giờ VSK",
                hours: 0.5
            }

            Model sẽ dùng processId + deduction_name
            để tìm deduction_type_id.
        */

        await ProductionTemp.createDeductions(

            tempId,

            processId,

            deductions

        );


        return res.status(201).json({

            success: true,

            message:
                "Tạo báo cáo thành công",

            id:
                tempId

        });

    }
    catch (err) {

        console.error(
            "CREATE TEMP REPORT ERROR:",
            err
        );


        return res.status(500).json({

            success: false,

            message:
                err.message
                ||
                "Không thể tạo báo cáo"

        });

    }

};


// =====================================================
// WORKER XEM LỊCH SỬ
// GET /api/production-temp/my
// =====================================================

exports.getMyTempReports = async (
    req,
    res
) => {

    try {

        const workerId =
            toPositiveInteger(
                req.user?.worker_id
            );


        if (!workerId) {

            return res.status(400).json({

                success: false,

                message:
                    "Tài khoản chưa có thông tin nhân viên"

            });

        }


        const data =
            await ProductionTemp
                .getHistoryByWorker(
                    workerId
                );


        return res.status(200).json({

            success: true,

            data

        });

    }
    catch (err) {

        console.error(
            "GET MY TEMP REPORTS ERROR:",
            err
        );


        return res.status(500).json({

            success: false,

            message:
                "Lỗi lấy lịch sử báo cáo"

        });

    }

};


// =====================================================
// MANAGER / LEAD / ADMIN XEM CHỜ DUYỆT
// =====================================================

exports.getPendingReports = async (
    req,
    res
) => {

    try {

        const userId =
            toPositiveInteger(
                req.user?.id
            );


        if (!userId) {

            return res.status(401).json({

                success: false,

                message:
                    "Thông tin đăng nhập không hợp lệ"

            });

        }


        const data =
            await ProductionTemp.getPending(
                userId
            );


        return res.status(200).json({

            success: true,

            data

        });

    }
    catch (err) {

        console.error(
            "GET PENDING REPORTS ERROR:",
            err
        );


        return res.status(500).json({

            success: false,

            message:
                err.message
                ||
                "Không thể lấy báo cáo chờ duyệt"

        });

    }

};


// =====================================================
// MANAGER / LEAD / ADMIN XEM ĐÃ DUYỆT
// =====================================================

exports.getApprovedReports = async (
    req,
    res
) => {

    try {

        const userId =
            toPositiveInteger(
                req.user?.id
            );


        if (!userId) {

            return res.status(401).json({

                success: false,

                message:
                    "Thông tin đăng nhập không hợp lệ"

            });

        }


        const data =
            await ProductionTemp.getApproved(
                userId
            );


        return res.status(200).json({

            success: true,

            data

        });

    }
    catch (err) {

        console.error(
            "GET APPROVED REPORTS ERROR:",
            err
        );


        return res.status(500).json({

            success: false,

            message:
                err.message
                ||
                "Không thể lấy báo cáo đã duyệt"

        });

    }

};


// =====================================================
// LẤY DANH SÁCH NGÀY CÓ BÁO CÁO
// =====================================================

exports.getTempDates = async (
    req,
    res
) => {

    try {

        const data =
            await ProductionTemp.getDates();


        return res.status(200).json({

            success: true,

            data

        });

    }
    catch (err) {

        console.error(
            "GET TEMP DATES ERROR:",
            err
        );


        return res.status(500).json({

            success: false,

            message:
                err.message
                ||
                "Không thể lấy danh sách ngày"

        });

    }

};


// =====================================================
// XEM BÁO CÁO THEO NGÀY
// GET /api/production-temp/by-date?date=YYYY-MM-DD
// =====================================================

exports.getTempReportsByDate = async (
    req,
    res
) => {

    try {

        const date =
            req.query.date;


        if (!date) {

            return res.status(400).json({

                success: false,

                message:
                    "Thiếu ngày cần xem"

            });

        }


        const data =
            await ProductionTemp.getByDate(
                date
            );


        return res.status(200).json({

            success: true,

            data

        });

    }
    catch (err) {

        console.error(
            "GET TEMP REPORTS BY DATE ERROR:",
            err
        );


        return res.status(500).json({

            success: false,

            message:
                err.message
                ||
                "Không thể lấy báo cáo theo ngày"

        });

    }

};


// =====================================================
// LẤY CHI TIẾT BÁO CÁO TEMP
// =====================================================

exports.getTempReportDetail = async (
    req,
    res
) => {

    try {

        const reportId =
            toPositiveInteger(
                req.params.id
            );


        if (!reportId) {

            return res.status(400).json({

                success: false,

                message:
                    "ID báo cáo không hợp lệ"

            });

        }


        const data =
            await ProductionTemp.getDetail(
                reportId
            );


        if (!data) {

            return res.status(404).json({

                success: false,

                message:
                    "Không tìm thấy báo cáo"

            });

        }


        // Worker chỉ được xem báo cáo của chính mình.
        // Manager, lead và admin vẫn có thể xem báo cáo thuộc phạm vi quản lý.
        if (
            req.user?.role === "worker"
            &&
            Number(data.worker_id) !== Number(req.user?.worker_id)
        ) {

            return res.status(403).json({

                success: false,

                message:
                    "Bạn không có quyền xem báo cáo này"

            });

        }


        return res.status(200).json({

            success: true,

            data

        });

    }
    catch (err) {

        console.error(
            "GET TEMP REPORT DETAIL ERROR:",
            err
        );


        return res.status(500).json({

            success: false,

            message:
                err.message
                ||
                "Không thể lấy chi tiết báo cáo"

        });

    }

};


// =====================================================
// DUYỆT BÁO CÁO THEO NGÀY
// =====================================================

exports.approveTempByDate = async (
    req,
    res
) => {

    try {

        const {
            date
        } = req.body;


        const reviewerId =
            toPositiveInteger(
                req.user?.id
            );


        if (!date) {

            return res.status(400).json({

                success: false,

                message:
                    "Thiếu ngày duyệt"

            });

        }


        if (!reviewerId) {

            return res.status(401).json({

                success: false,

                message:
                    "Thông tin người duyệt không hợp lệ"

            });

        }


        const result =
            await ProductionTemp.approveByDate(

                date,

                reviewerId

            );


        /*
            Báo cáo trong database đã được duyệt trước.

            Nếu đồng bộ Google Sheet lỗi,
            hệ thống trả lỗi nhưng dữ liệu database
            có thể đã được duyệt.
        */

        try {

            await GoogleSheetService
                .syncProductionReport(
                    date
                );

        }
        catch (sheetError) {

            console.error(
                "GOOGLE SHEET SYNC ERROR:",
                sheetError
            );


            return res.status(200).json({

                success: true,

                warning: true,

                message:
                    "Duyệt báo cáo thành công nhưng đồng bộ Google Sheet thất bại",

                data:
                    result

            });

        }


        return res.status(200).json({

            success: true,

            message:
                "Duyệt báo cáo thành công",

            data:
                result

        });

    }
    catch (err) {

        console.error(
            "APPROVE TEMP BY DATE ERROR:",
            err
        );


        return res.status(500).json({

            success: false,

            message:
                err.message
                ||
                "Không thể duyệt báo cáo"

        });

    }

};