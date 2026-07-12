import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { getReports } from "../../services/productionService";
import type { ProductionReport } from "../../types/production";

import "./Dashboard.css";


function Dashboard() {

    const navigate = useNavigate();


    const [reports, setReports] = useState<ProductionReport[]>([]);

    const [loading, setLoading] = useState(true);



    useEffect(() => {

        const loadData = async () => {

            try {

                const data = await getReports();

                setReports(data);

            }
            catch(err){

                console.error(
                    "Lỗi lấy dữ liệu:",
                    err
                );

            }
            finally{

                setLoading(false);

            }

        };


        loadData();


    },[]);



    if(loading){

        return (

            <div className="manager-dashboard">

                <h2>
                    Đang tải dữ liệu...
                </h2>

            </div>

        );

    }



    const totalOK =
        reports.reduce(
            (sum,item)=>
                sum + (item.tt_ok || 0),
            0
        );


    const totalNG =
        reports.reduce(
            (sum,item)=>
                sum + (item.tt_ng || 0),
            0
        );



    return (

        <div className="manager-dashboard">


            <div className="manager-header">

                <h1>
                    📊 Quản lý sản xuất
                </h1>


                <p>
                    Theo dõi và kiểm tra báo cáo gia công
                </p>

            </div>




            <div className="dashboard-grid">


                <div
                    className="dashboard-card"
                    onClick={()=>
                        navigate("/manager/reports")
                    }
                >

                    <div className="card-icon">
                        📋
                    </div>


                    <h3>
                        Báo cáo sản xuất
                    </h3>


                    <p>
                        {reports.length} báo cáo chờ kiểm tra
                    </p>


                </div>





                <div
                    className="dashboard-card"
                    onClick={()=>
                        navigate("/manager/export")
                    }
                >

                    <div className="card-icon">
                        📥
                    </div>


                    <h3>
                        Tải báo cáo
                    </h3>


                    <p>
                        Xuất dữ liệu Excel
                    </p>


                </div>





                <div
                    className="dashboard-card"
                >

                    <div className="card-icon">
                        ✅
                    </div>


                    <h3>
                        Sản lượng OK
                    </h3>


                    <p>
                        {totalOK}
                    </p>


                </div>





                <div
                    className="dashboard-card"
                >

                    <div className="card-icon">
                        ❌
                    </div>


                    <h3>
                        Sản phẩm NG
                    </h3>


                    <p>
                        {totalNG}
                    </p>


                </div>



            </div>



        </div>

    );

}


export default Dashboard;