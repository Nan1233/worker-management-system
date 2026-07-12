import { useState } from "react";
import "./ProcessPage.css";

import { createReport } from "../../services/productionService";

import FormSection from "../../components/process/FormSection";
import InputField from "../../components/process/InputField";
import NumberField from "../../components/process/NumberField";
import SelectField from "../../components/process/SelectField";
import TextAreaField from "../../components/process/TextAreaField";


function ProcessPage() {


    const initialForm = {

        workDate: "",
        shift: "Ca 1",

        workerCode: "W001",

        machineNo: "",


        totalTime: 0,

        actualTime: 0,

        deductionTime: 0,


        productName: "",


        standardOutput: 0,

        actualOutput: 0,


        ttOk: 0,

        ttNg: 0,


        kqdDapLai: 0,

        kqdTuot: 0,


        voDoLong: 0,

        xuocDoLong: 0,

        congGay: 0,

        xoay: 0,

        khongDut: 0,

        baviaHut: 0,

        ppcm: 0,

        loiCaoSu: 0,

        ngKichThuoc: 0,

        catLem: 0,


        note:""

    };



    const [form,setForm] = useState(initialForm);



    const handleChange = (
        e: React.ChangeEvent<
        HTMLInputElement |
        HTMLSelectElement |
        HTMLTextAreaElement
        >
    )=>{


        const {name,value}=e.target;


        setForm({

            ...form,

            [name]:

            e.target.type==="number"
            ?
            Number(value)
            :
            value

        });


    };





    const handleSubmit = async()=>{


        try{


            await createReport({


                // worker W001
                worker_id:1,


                // Gia công
                process_id:1,



                work_date:form.workDate,


                shift:form.shift,


                machine_no:form.machineNo,



                total_time:form.totalTime,

                actual_time:form.actualTime,

                deduction_time:form.deductionTime,



                product_name:form.productName,


                standard_output:form.standardOutput,


                actual_output:form.actualOutput,



                tt_ok:form.ttOk,

                tt_ng:form.ttNg,



                kqd_dap_lai:form.kqdDapLai,

                kqd_tuot:form.kqdTuot,



                vo_do_long:form.voDoLong,

                xuoc_do_long:form.xuocDoLong,


                cong_gay:form.congGay,


                xoay:form.xoay,


                khong_dut:form.khongDut,


                bavia_hut:form.baviaHut,


                ppcm:form.ppcm,


                loi_cao_su:form.loiCaoSu,


                ng_kich_thuoc:form.ngKichThuoc,


                cat_lem:form.catLem,


                note:form.note



            });



            alert("Lưu báo cáo thành công");


            handleReset();



        }
        catch(err){


            console.log(err);


            alert("Lưu thất bại");


        }


    };





    const handleReset=()=>{


        setForm(initialForm);


    };





return (

<div className="container">


<h1>
BÁO CÁO GIA CÔNG
</h1>




<FormSection title="Thông tin chung">



<InputField

type="date"

label="Ngày"

name="workDate"

value={form.workDate}

onChange={handleChange}

/>



<SelectField

label="Ca làm việc"

name="shift"

value={form.shift}

onChange={handleChange}

options={[
"Ca 1",
"Ca 2",
"Ca 3"
]}

/>



<InputField

label="Mã nhân viên"

name="workerCode"

value={form.workerCode}

onChange={handleChange}

/>



<InputField

label="Số máy"

name="machineNo"

value={form.machineNo}

onChange={handleChange}

/>



</FormSection>






<FormSection title="Thời gian">


<NumberField

label="Tổng thời gian"

name="totalTime"

value={form.totalTime}

onChange={handleChange}

/>



<NumberField

label="Thời gian thực tế"

name="actualTime"

value={form.actualTime}

onChange={handleChange}

/>



<NumberField

label="Thời gian trừ"

name="deductionTime"

value={form.deductionTime}

onChange={handleChange}

/>


</FormSection>







<FormSection title="Sản xuất">


<InputField

label="Sản phẩm"

name="productName"

value={form.productName}

onChange={handleChange}

/>



<NumberField

label="Định mức"

name="standardOutput"

value={form.standardOutput}

onChange={handleChange}

/>



<NumberField

label="Thực tế"

name="actualOutput"

value={form.actualOutput}

onChange={handleChange}

/>


</FormSection>







<FormSection title="Báo cáo chất lượng">


<NumberField label="TT OK" name="ttOk" value={form.ttOk} onChange={handleChange}/>

<NumberField label="TT NG" name="ttNg" value={form.ttNg} onChange={handleChange}/>

<NumberField label="KQD dập lại" name="kqdDapLai" value={form.kqdDapLai} onChange={handleChange}/>

<NumberField label="KQD tuốt" name="kqdTuot" value={form.kqdTuot} onChange={handleChange}/>

<NumberField label="Vỡ do lồng" name="voDoLong" value={form.voDoLong} onChange={handleChange}/>

<NumberField label="Xước do lồng" name="xuocDoLong" value={form.xuocDoLong} onChange={handleChange}/>

<NumberField label="Cong gãy" name="congGay" value={form.congGay} onChange={handleChange}/>

<NumberField label="Xoay" name="xoay" value={form.xoay} onChange={handleChange}/>

<NumberField label="Không đứt" name="khongDut" value={form.khongDut} onChange={handleChange}/>

<NumberField label="Bavia hụt" name="baviaHut" value={form.baviaHut} onChange={handleChange}/>

<NumberField label="PPCM" name="ppcm" value={form.ppcm} onChange={handleChange}/>

<NumberField label="Lỗi cao su" name="loiCaoSu" value={form.loiCaoSu} onChange={handleChange}/>

<NumberField label="NG kích thước" name="ngKichThuoc" value={form.ngKichThuoc} onChange={handleChange}/>

<NumberField label="Cắt lẹm" name="catLem" value={form.catLem} onChange={handleChange}/>


<TextAreaField

label="Ghi chú"

name="note"

value={form.note}

onChange={handleChange}

/>


</FormSection>





<div className="button-group">


<button

className="save-btn"

onClick={handleSubmit}

>

Lưu báo cáo

</button>



<button

className="reset-btn"

onClick={handleReset}

>

Làm mới

</button>


</div>




</div>


);


}


export default ProcessPage;