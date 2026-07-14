import {
    useEffect,
    useState
} from "react";

import {
    useNavigate,
    useParams,
    useSearchParams
} from "react-router-dom";


import {
    getTempReportById,
    getReportById
} from "../../services/productionService";


import type {
    ProductionReport
} from "../../types/production";


import "./ReportDetail.css";



function ReportDetail() {


    const {
        id
    } = useParams();



    const navigate = useNavigate();



    const [
        searchParams
    ] = useSearchParams();



    const source =
        searchParams.get("source");



    const [
        report,
        setReport
    ] = useState<ProductionReport | null>(null);



    const [
        loading,
        setLoading
    ] = useState(true);







    useEffect(()=>{


        const loadReport = async()=>{


            try{


                if(!id)
                    return;



                let data;



                // ============================
                // BÁO CÁO ĐÃ DUYỆT
                // production_reports
                // ============================

                if(source === "approved"){


                    data =
                    await getReportById(
                        Number(id)
                    );


                }


                // ============================
                // BÁO CÁO CHƯA DUYỆT
                // production_reports_temp
                // ============================

                else{


                    data =
                    await getTempReportById(
                        Number(id)
                    );


                }



                setReport(data);



            }
            catch(err){


                console.error(
                    "Load report error:",
                    err
                );


            }
            finally{


                setLoading(false);


            }


        };



        loadReport();



    },[
        id,
        source
    ]);









    if(loading){


        return (

            <h2>
                Đang tải...
            </h2>

        );


    }







    if(!report){


        return (

            <h2>
                Không tìm thấy báo cáo
            </h2>

        );


    }







    return (

        <div className="report-detail">






            <div className="detail-header">


                <h1>
                    📋 Chi tiết báo cáo
                </h1>



                <button

                    onClick={()=>navigate(-1)}

                >

                    Quay lại

                </button>


            </div>









            {
                report.status === "approved" &&

                <div className="detail-card">


                    <h2>
                        Trạng thái duyệt
                    </h2>


                    <p>

                        <b>
                            Trạng thái:
                        </b>

                        {" "}

                        ✅ Đã duyệt

                    </p>



                    {
                        report.approved_at &&

                        <p>

                            <b>
                                Thời gian duyệt:
                            </b>

                            {" "}

                            {
                                new Date(
                                    report.approved_at
                                )
                                .toLocaleString(
                                    "vi-VN"
                                )
                            }

                        </p>

                    }


                </div>

            }









            <div className="detail-card">


                <h2>
                    Thông tin chung
                </h2>



                <p>

                    <b>
                        Nhân viên:
                    </b>

                    {" "}

                    {report.full_name}

                    {" "}

                    ({report.worker_code})

                </p>




                <p>

                    <b>
                        Công đoạn:
                    </b>

                    {" "}

                    {report.process_name}

                </p>




                <p>

                    <b>
                        Ngày sản xuất:
                    </b>

                    {" "}

                    {
                        new Date(
                            report.work_date
                        )
                        .toLocaleDateString(
                            "vi-VN"
                        )
                    }

                </p>




                <p>

                    <b>
                        Ca:
                    </b>

                    {" "}

                    {report.shift}

                </p>




                <p>

                    <b>
                        Số máy:
                    </b>

                    {" "}

                    {report.machine_no}

                </p>




                <p>

                    <b>
                        Sản phẩm:
                    </b>

                    {" "}

                    {report.product_name}

                </p>





                {
                    report.created_at &&

                    <p>

                        <b>
                            Thời gian gửi:
                        </b>

                        {" "}

                        {
                            new Date(
                                report.created_at
                            )
                            .toLocaleString(
                                "vi-VN"
                            )
                        }

                    </p>

                }



            </div>









            <div className="detail-card">


                <h2>
                    Sản xuất
                </h2>



                <p>
                    Định mức:
                    {" "}
                    {report.standard_output}
                </p>


                <p>
                    Thực tế:
                    {" "}
                    {report.actual_output}
                </p>


                <p>
                    OK:
                    {" "}
                    {report.tt_ok}
                </p>


                <p>
                    NG:
                    {" "}
                    {report.tt_ng}
                </p>


            </div>









            <div className="detail-card">


                <h2>
                    Lỗi chất lượng
                </h2>



                <p>
                    Dập lại:
                    {" "}
                    {report.kqd_dap_lai}
                </p>


                <p>
                    Tuột:
                    {" "}
                    {report.kqd_tuot}
                </p>


                <p>
                    Vỡ do lồng:
                    {" "}
                    {report.vo_do_long}
                </p>


                <p>
                    Xước do lồng:
                    {" "}
                    {report.xuoc_do_long}
                </p>


                <p>
                    Cong gãy:
                    {" "}
                    {report.cong_gay}
                </p>


                <p>
                    Xoay:
                    {" "}
                    {report.xoay}
                </p>


                <p>
                    Không đứt:
                    {" "}
                    {report.khong_dut}
                </p>


                <p>
                    Bavia hụt:
                    {" "}
                    {report.bavia_hut}
                </p>


                <p>
                    PPCM:
                    {" "}
                    {report.ppcm}
                </p>


                <p>
                    Lỗi cao su:
                    {" "}
                    {report.loi_cao_su}
                </p>


                <p>
                    NG kích thước:
                    {" "}
                    {report.ng_kich_thuoc}
                </p>


                <p>
                    Cắt lẹm:
                    {" "}
                    {report.cat_lem}
                </p>



            </div>









            <div className="detail-card">


                <h2>
                    Ghi chú
                </h2>


                <p>

                    {
                        report.note ||
                        "Không có"
                    }

                </p>


            </div>







        </div>

    );


}



export default ReportDetail;