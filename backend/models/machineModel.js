const db =
    require("../config/db");


exports.findByProcess = (
    processId
) => {

    return new Promise(
        (
            resolve,
            reject
        ) => {

            const sql = `

                SELECT
                    id,
                    process_id,
                    machine_code,
                    machine_name,
                    COALESCE(is_automatic, 0) AS is_automatic,
                    COALESCE(max_workers_per_machine, 1) AS max_workers_per_machine,
                    COALESCE(output_basis, 'PRODUCT') AS output_basis

                FROM machines

                WHERE process_id = ?

                AND status = 'active'

                ORDER BY
                    machine_code ASC

            `;


            db.query(
                sql,
                [
                    processId
                ],
                (
                    error,
                    rows
                ) => {

                    if (error) {

                        return reject(
                            error
                        );

                    }


                    resolve(
                        rows
                    );

                }
            );

        }
    );

};