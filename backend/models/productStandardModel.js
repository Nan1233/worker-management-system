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
                    work_type,
                    product_code,
                    standard_output

                FROM product_standards

                WHERE process_id = ?

                AND status = 'active'

                ORDER BY
                    work_type ASC,
                    product_code ASC

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