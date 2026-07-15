import {
    useState,
    useEffect
} from "react";

import {
    useNavigate
} from "react-router-dom";


import "./ProcessPage.css";


import {
    createTempReport
} from "../../services/productionService";


import FormSection from "../../components/process/FormSection";
import InputField from "../../components/process/InputField";
import NumberField from "../../components/process/NumberField";
import TextAreaField from "../../components/process/TextAreaField";


import api from "../../api/axios";



function ProcessPage(){


const navigate = useNavigate();








const initialForm = {


workDate:"",


shift:"Ca 1",


workerCode:"",


machineNo:"",



totalTime:"",


actualTime:"",


deductionTime:"",



productName:"",


standardOutput:"",


actualOutput:"",



ttOk:"",


ttNg:"",



kqdDapLai:"",


kqdTuot:"",


voDoLong:"",


xuocDoLong:"",


congGay:"",


xoay:"",


khongDut:"",


baviaHut:"",


ppcm:"",


loiCaoSu:"",


ngKichThuoc:"",


catLem:"",



note:""


};







const initialDeduction={


vsk:"",


fiveS:"",


hamKhuon:"",


suaKhuon:"",


suaMay:"",


dungMay:""


};




















const [form,setForm] =
useState(initialForm);









const [stopReason,setStopReason] =
useState("");









// =================================================
// LẤY THÔNG TIN WORKER LOGIN
// =================================================


useEffect(()=>{


const getWorkerInfo = async()=>{


try{


const user =
JSON.parse(
localStorage.getItem("user") || "{}"
);



if(!user.worker_id){

    console.log(
        "Không có worker_id"
    );

    return;

}



const res =
await api.get(
    `/workers/${user.worker_id}`
);




setForm(prev=>({


...prev,


workerCode:
res.data.worker_code


}));



}
catch(err){


console.log(
"Không lấy được thông tin nhân viên",
err
);


}



};



getWorkerInfo();



},[]);
// =================================================
// HANDLE INPUT
// =================================================


const handleChange = (

e:
React.ChangeEvent<
HTMLInputElement |
HTMLSelectElement |
HTMLTextAreaElement
>

)=>{


const {
name,
value
}=e.target;



if(
name==="ttOk"
){


setForm(prev=>{


const data:any={

...prev,

[name]:value

};



data.actualOutput =
String(

Number(data.ttOk || 0)

+

Number(data.ttNg || 0)

);



return data;


});


return;


}




setForm(prev=>({


...prev,


[name]:value


}));



};







// =================================================
// DEDUCTION
// =================================================








// =================================================
// NG
// =================================================








// =================================================
// SUBMIT
// =================================================


const handleSubmit = async()=>{


try{


const user =

JSON.parse(

localStorage.getItem("user") || "{}"

);





await createTempReport({


worker_id:

Number(user.worker_id),



process_id:1,



work_date:
form.workDate,



shift:
form.shift,



machine_no:
form.machineNo,



total_time:

Number(form.totalTime || 0),



actual_time:

Number(form.actualTime || 0),



deduction_time:

Number(form.deductionTime || 0),



stop_reason:

stopReason,



product_name:

form.productName,



standard_output:

Number(form.standardOutput || 0),



actual_output:

Number(form.actualOutput || 0),



tt_ok:

Number(form.ttOk || 0),



tt_ng:

Number(form.ttNg || 0),



kqd_dap_lai:

Number(form.kqdDapLai || 0),



kqd_tuot:

Number(form.kqdTuot || 0),



vo_do_long:

Number(form.voDoLong || 0),



xuoc_do_long:

Number(form.xuocDoLong || 0),



cong_gay:

Number(form.congGay || 0),



xoay:

Number(form.xoay || 0),



khong_dut:

Number(form.khongDut || 0),



bavia_hut:

Number(form.baviaHut || 0),



ppcm:

Number(form.ppcm || 0),



loi_cao_su:

Number(form.loiCaoSu || 0),



ng_kich_thuoc:

Number(form.ngKichThuoc || 0),



cat_lem:

Number(form.catLem || 0),



note:

form.note



});


alert(
"Lưu báo cáo thành công"
);


handleReset();


navigate("/worker");


}
catch(err){


console.log(err);


alert(
"Lưu thất bại"
);


}


};








// =================================================
// RESET
// =================================================


const handleReset=()=>{


setForm(initialForm);


setStopReason("");


};









// =================================================
// XÓA 0 KHI BLUR
// =================================================


const handleNumberBlur=(

e:
React.FocusEvent<HTMLInputElement>

)=>{


const {

name,

value

}=e.target;



if(value==="0"){


setForm(prev=>({


...prev,


[name]:""


}));


}



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



<InputField

label="Mã nhân viên"

name="workerCode"

value={form.workerCode}

onChange={()=>{}}

/>



<InputField

label="Số máy"

name="machineNo"

value={form.machineNo}

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

allowDecimal={false}

onChange={handleChange}

/>



<NumberField

label="Thực tế"

name="actualOutput"

value={form.actualOutput}

allowDecimal={false}

onChange={handleChange}

/>


</FormSection>





<FormSection title="Báo cáo chất lượng">


<NumberField

label="TT OK"

name="ttOk"

value={form.ttOk}

allowDecimal={false}

onChange={handleChange}

onBlur={handleNumberBlur}

/>



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