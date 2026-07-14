import { useState } from "react";
import { useNavigate } from "react-router-dom";

import "./ProcessPage.css";

import { createTempReport } from "../../services/productionService";

import FormSection from "../../components/process/FormSection";
import InputField from "../../components/process/InputField";
import NumberField from "../../components/process/NumberField";
import SelectField from "../../components/process/SelectField";
import TextAreaField from "../../components/process/TextAreaField";



function ProcessPage(){


const navigate = useNavigate();



const [showDeduction,setShowDeduction] =
useState(false);


const [showNg,setShowNg] =
useState(false);




const initialForm = {

workDate:"",

shift:"Ca 1",

workerCode:"W001",

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






const deductionOptions=[


{
key:"vsk",
label:"Số giờ VSK"
},


{
key:"fiveS",
label:"Số giờ 5S + gia ca"
},


{
key:"hamKhuon",
label:"Số giờ hâm khuôn"
},


{
key:"suaKhuon",
label:"Số giờ sửa khuôn"
},


{
key:"suaMay",
label:"Số giờ sửa máy"
},


{
key:"dungMay",
label:"Số giờ dừng máy"
}


];







const ngOptions=[


{
key:"kqdDapLai",
label:"KQD dập lại"
},


{
key:"kqdTuot",
label:"KQD tuột"
},


{
key:"voDoLong",
label:"Vỡ do lồng"
},


{
key:"xuocDoLong",
label:"Xước do lồng"
},


{
key:"congGay",
label:"Cong gãy"
},


{
key:"xoay",
label:"Xoay"
},


{
key:"khongDut",
label:"Không đứt"
},


{
key:"baviaHut",
label:"Bavia hụt"
},


{
key:"ppcm",
label:"PPCM"
},


{
key:"loiCaoSu",
label:"Lỗi cao su"
},


{
key:"ngKichThuoc",
label:"NG kích thước"
},


{
key:"catLem",
label:"Cắt lẹm"
}


];








const [form,setForm] =
useState(initialForm);



const [deductions,setDeductions] =
useState(initialDeduction);



const [selectedDeduction,setSelectedDeduction] =
useState<string[]>([]);



const [selectedNg,setSelectedNg] =
useState<string[]>([]);



const [stopReason,setStopReason] =
useState("");








// ===============================
// INPUT CHANGE
// ===============================


const handleChange = (

e:React.ChangeEvent<
HTMLInputElement |
HTMLSelectElement |
HTMLTextAreaElement
>

)=>{


const {
name,
value
}=e.target;





// =====================
// TÍNH THỰC TẾ = OK + NG
// =====================


if(
name==="ttOk" ||
name==="ttNg"
){


setForm(prev=>{


const data={

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









// ===============================
// DEDUCTION
// ===============================



const updateTotalDeduction=(data:any)=>{


const total =

Object.values(data)

.reduce(

(sum:number,value:any)=>

sum + Number(value || 0),

0

);




setForm(prev=>({


...prev,


deductionTime:String(total),


actualTime:String(

Math.max(

0,

Number(prev.totalTime || 0)

-

total

)

)



}));



};







const handleDeductionSelect=(

e:React.ChangeEvent<HTMLSelectElement>

)=>{


const values =

Array.from(
e.target.selectedOptions
)

.map(
x=>x.value
);




setSelectedDeduction(values);




const update:any={

...deductions

};




deductionOptions.forEach(item=>{


if(values.includes(item.key)){


if(update[item.key]==="")

update[item.key]="1";



}

else{


update[item.key]="";


}


});




setDeductions(update);


updateTotalDeduction(update);



};









const updateDeductionValue=(

key:string,

value:string

)=>{



setDeductions(prev=>{


const data={

...prev,

[key]:value

};



updateTotalDeduction(data);



return data;


});



};

const handleDeductionBlur = (
    key:string,
    value:string
)=>{


    if(value==="0"){


        setDeductions(prev=>{

            const data={

                ...prev,

                [key]:""

            };


            updateTotalDeduction(data);


            return data;

        });


    }


};







// ===============================
// NG
// ===============================



const handleNgSelect=(

e:React.ChangeEvent<HTMLSelectElement>

)=>{


const values =

Array.from(
e.target.selectedOptions
)

.map(
x=>x.value
);




setSelectedNg(values);




setForm(prev=>{


const data:any={

...prev

};




ngOptions.forEach(item=>{


if(values.includes(item.key)){



if(data[item.key]==="")

data[item.key]="1";



}

else{


data[item.key]="";



}



});





data.ttNg =

String(

ngOptions.reduce(

(sum,item)=>

sum + Number(data[item.key] || 0),

0

)

);






data.actualOutput =

String(

Number(data.ttOk || 0)

+

Number(data.ttNg || 0)

);




return data;



});



};








const handleNgValue=(

key:string,

value:string

)=>{



// chỉ nhận số nguyên

if(
value!=="" &&
!/^\d*$/.test(value)
){

return;

}




setForm(prev=>{


const data:any={

...prev,

[key]:value

};





data.ttNg =

String(

ngOptions.reduce(

(sum,item)=>

sum + Number(data[item.key] || 0),

0

)

);





data.actualOutput =

String(

Number(data.ttOk || 0)

+

Number(data.ttNg || 0)

);





return data;



});



};
const handleSubmit = async()=>{


try{


await createTempReport({


process_id:1,


work_date:form.workDate,


shift:form.shift,


machine_no:form.machineNo,



total_time:Number(
form.totalTime || 0
),



actual_time:Number(
form.actualTime || 0
),



deduction_time:Number(
form.deductionTime || 0
),




product_name:form.productName,



standard_output:Number(
form.standardOutput || 0
),



actual_output:Number(
form.actualOutput || 0
),




tt_ok:Number(
form.ttOk || 0
),



tt_ng:Number(
form.ttNg || 0
),





kqd_dap_lai:Number(
form.kqdDapLai || 0
),


kqd_tuot:Number(
form.kqdTuot || 0
),


vo_do_long:Number(
form.voDoLong || 0
),


xuoc_do_long:Number(
form.xuocDoLong || 0
),


cong_gay:Number(
form.congGay || 0
),


xoay:Number(
form.xoay || 0
),


khong_dut:Number(
form.khongDut || 0
),


bavia_hut:Number(
form.baviaHut || 0
),


ppcm:Number(
form.ppcm || 0
),


loi_cao_su:Number(
form.loiCaoSu || 0
),


ng_kich_thuoc:Number(
form.ngKichThuoc || 0
),


cat_lem:Number(
form.catLem || 0
),



note:form.note



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







const handleReset=()=>{


setForm(initialForm);


setDeductions(initialDeduction);


setSelectedDeduction([]);


setSelectedNg([]);


setStopReason("");



};







const handleNumberBlur = (
    e: React.FocusEvent<HTMLInputElement>
)=>{

    const {
        name,
        value
    } = e.target;


    if(value === "0"){

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





{/* THÔNG TIN CHUNG */}



<FormSection title="Thông tin chung">



<InputField

type="date"

label="Ngày"

name="workDate"

value={form.workDate}

onChange={handleChange}

/>







<div className="shift-group">


<label className="shift-label">

Ca làm việc

</label>



<div className="radio-list">



{

[
"Ca 1",
"Ca 2",
"Ca 3"
]

.map(ca=>(


<label

key={ca}

className="radio-item"

>



<input

type="radio"

name="shift"

value={ca}

checked={
form.shift===ca
}

onChange={handleChange}

/>



<span>

{ca}

</span>



</label>


))


}



</div>


</div>









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












{/* THỜI GIAN */}



<FormSection title="Thời gian">





<NumberField

label="Tổng thời gian"

name="totalTime"

value={form.totalTime}

allowDecimal={true}

onChange={handleChange}
onBlur={handleNumberBlur}

/>







<NumberField

label="Thời gian thực tế"

name="actualTime"

value={form.actualTime}

allowDecimal={true}

onChange={handleChange}
onBlur={handleNumberBlur}

/>








<NumberField

label="Thời gian trừ"

name="deductionTime"

value={form.deductionTime}

allowDecimal={true}

onChange={handleChange}
onBlur={handleNumberBlur}


/>









<div className="select-box">



<div

className="select-title"

onClick={()=>setShowDeduction(!showDeduction)}

>



⏱ Chọn loại trừ thời gian



<span>

{

showDeduction

?

"▲"

:

"▼"

}


</span>



</div>







{

showDeduction &&



<select

multiple

value={selectedDeduction}

onChange={handleDeductionSelect}

>



{


deductionOptions.map(item=>(


<option

key={item.key}

value={item.key}

>


{item.label}


</option>


))


}



</select>



}





</div>









<div className="quality-grid">



{


deductionOptions

.filter(item=>

deductions[
item.key as keyof typeof deductions
] !== ""

)

.map(item=>(


<NumberField

key={item.key}

label={item.label}

name={item.key}

value={
deductions[
item.key as keyof typeof deductions
]
}

allowDecimal={true}

onChange={e=>

updateDeductionValue(

item.key,

e.target.value

)

}

onBlur={()=>


handleDeductionBlur(

item.key,

deductions[
item.key as keyof typeof deductions
]

)


}

/>

))


}



</div>








{

deductions.dungMay!=="" &&




<SelectField


label="Lý do dừng máy"


name="stopReason"


value={stopReason}


onChange={e=>

setStopReason(
e.target.value
)

}



options={[

"Hỏng máy",

"Thiếu nguyên liệu",

"Chờ kỹ thuật",

"Khác"

]}


/>



}





</FormSection>
{/* SẢN XUẤT */}



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













{/* CHẤT LƯỢNG */}




<FormSection title="Báo cáo chất lượng">






<NumberField

label="TT OK"

name="ttOk"

value={form.ttOk}

allowDecimal={false}

onChange={handleChange}

onBlur={handleNumberBlur}

/>








<NumberField


label="TT NG"


name="ttNg"


value={form.ttNg}


allowDecimal={false}


onChange={handleChange}


/>









<div className="select-box">



<div


className="select-title"


onClick={()=>setShowNg(!showNg)}


>



⚠️ Chọn lỗi NG




<span>


{

showNg

?

"▲"

:

"▼"

}


</span>




</div>









{

showNg &&



<select


multiple


value={selectedNg}


onChange={handleNgSelect}



>



{


ngOptions.map(item=>(



<option


key={item.key}


value={item.key}


>



{item.label}



</option>




))


}



</select>




}



</div>













<div className="quality-grid">





{


ngOptions

.filter(item=>



form[item.key as keyof typeof form] !== ""



)

.map(item=>(




<NumberField

key={item.key}

label={item.label}

name={item.key}

value={
form[item.key as keyof typeof form]
}

allowDecimal={false}

onChange={e=>
handleNgValue(
item.key,
e.target.value
)
}

onBlur={handleNumberBlur}

/>



))


}




</div>













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