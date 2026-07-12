import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import "./ProductionHistory.css";

import { getReports } from "../../services/productionService";
import type { ProductionReport } from "../../types/production";


function ProductionHistory() {


    const navigate = useNavigate();


    const [reports, setReports] = useState<ProductionReport[]>([]);

    const [loading, setLoading] = useState(true);





    useEffect(() => {


        const loadReports = async () => {


            try {


                const data = await getReports();


                setReports(data);



            }

            catch (err) {


                console.log(err);


            }

            finally {


                setLoading(false);


            }


        };



        loadReports();



    }, []);








    if (loading) {


        return (

            <div className="history-container">

                <h2>
                    Đang tải dữ liệu...
                </h2>

            </div>

        );


    }







    return (

        <div className="history-container">



            <div className="page-header">


                <h2>
                    📋 Báo cáo của tôi
                </h2>


                <p>
                    Danh sách báo cáo sản xuất đã gửi
                </p>


            </div>







            {
                reports.length === 0 ?


                (

                    <div className="empty">


                        <h3>
                            Chưa có báo cáo
                        </h3>


                        <p>
                            Bạn chưa gửi báo cáo sản xuất nào.
                        </p>


                    </div>


                )


                :


                (


                    <div className="report-list">


                        {
                            reports.map((item) => (


                                <div

                                    key={item.id}

                                    className="report-card"


                                    onClick={() => {


                                        if(item.id){

                                            navigate(
                                                `/worker/history/${item.id}`
                                            );

                                        }


                                    }}


                                >



                                    <h3>

                                        {
                                            item.product_name ||
                                            "Báo cáo sản xuất"
                                        }

                                    </h3>





                                    <p>
                                        📅 Ngày: {item.work_date}
                                    </p>




                                    <p>
                                        🕒 Ca: {item.shift}
                                    </p>




                                    <p>
                                        🏭 Máy: {item.machine_no}
                                    </p>




                                    <p>

                                        ✅ OK: {item.tt_ok}

                                        &nbsp;&nbsp;

                                        ❌ NG: {item.tt_ng}

                                    </p>





                                </div>


                            ))
                        }



                    </div>


                )


            }




        </div>


    );


}



export default ProductionHistory;