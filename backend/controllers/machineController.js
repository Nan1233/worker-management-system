const machineModel =
    require("../models/machineModel");


exports.getMachines = async (
    req,
    res
) => {

    try {

        const processId =
            Number(
                req.query.process_id
            );


        if (
            !Number.isInteger(
                processId
            )
            ||
            processId <= 0
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "process_id không hợp lệ"

            });

        }


        const data =
            await machineModel.findByProcess(
                processId
            );


        return res.status(200).json({

            success: true,

            data

        });

    }
    catch (error) {

        console.error(
            "GET MACHINES ERROR:",
            error
        );


        return res.status(500).json({

            success: false,

            message:
                "Không thể lấy danh sách máy"

        });

    }

};