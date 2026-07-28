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
                    machine_name

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