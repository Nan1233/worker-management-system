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
const [showDeduction,setShowDeduction] = useState(false);


const [showNg,setShowNg] = useState(false);

const navigate = useNavigate();



const initialForm = {


workDate:"",

shift:"Ca 1",

workerCode:"W001",

machineNo:"",


totalTime:0,

actualTime:0,

deductionTime:0,


productName:"",

standardOutput:0,

actualOutput:0,


ttOk:0,

ttNg:0,


kqdDapLai:0,

kqdTuot:0,

voDoLong:0,

xuocDoLong:0,

congGay:0,

xoay:0,

khongDut:0,

baviaHut:0,

ppcm:0,

loiCaoSu:0,

ngKichThuoc:0,

catLem:0,


note:""


};



const initialDeduction={


vsk:0,

fiveS:0,

hamKhuon:0,

suaKhuon:0,

suaMay:0,

dungMay:0


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



const ngOptions = [


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



const [form,setForm]=useState(initialForm);


const [deductions,setDeductions]=useState(initialDeduction);


const [selectedDeduction,setSelectedDeduction]=useState<string[]>([]);


const [selectedNg,setSelectedNg]=useState<string[]>([]);


const [stopReason,setStopReason]=useState("");



const handleChange=(

e:React.ChangeEvent<
HTMLInputElement |
HTMLSelectElement |
HTMLTextAreaElement
>

)=>{


const {name,value}=e.target;


setForm(prev=>({

...prev,

[name]:

e.target.type==="number"

?

Number(value)

:

value


}));



};




const handleDeductionSelect=(

e:React.ChangeEvent<HTMLSelectElement>

)=>{


const values=

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


if(update[item.key]===0)

update[item.key]=1;


}

else{


update[item.key]=0;


}


});



setDeductions(update);



updateTotalDeduction(update);



};




const updateDeductionValue=(

key:string,

value:number

)=>{


const data={

...deductions,

[key]:

value<0?0:value


};



setDeductions(data);


updateTotalDeduction(data);



};



const updateTotalDeduction=(data:any)=>{


const total:number =

Object.values(data)

.reduce(

(sum:number,value:any)=>{

return sum + Number(value || 0);

},

0

);



setForm(prev=>({


...prev,


deductionTime: total,


actualTime:

Math.max(

0,

prev.totalTime - total

)


}));



};
const handleNgSelect=(

e:React.ChangeEvent<HTMLSelectElement>

)=>{


const values=

Array.from(
e.target.selectedOptions
)
.map(
x=>x.value
);



setSelectedNg(values);



const update:any={

...form

};



ngOptions.forEach(item=>{


if(values.includes(item.key)){


if(update[item.key]===0)

update[item.key]=1;


}

else{


update[item.key]=0;


}



});



setForm(prev=>({

...prev,

...update,

ttNg:

values.reduce(

(total,key)=>{

return total + (update[key] || 0);

},

0

)


}));



};






const handleNgValue=(

key:string,

value:number

)=>{


const newValue =

value<0 ? 0:value;



setForm(prev=>{


const data={

...prev,

[key]:newValue

};



data.ttNg =

selectedNg.reduce(

(sum,item)=>{

return sum +

Number(data[item as keyof typeof data] || 0);


},

0

);



return data;


});



};







const handleSubmit=async()=>{


try{


await createTempReport({


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





return (        <div className="container">


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
            ].map(ca=>(

                <label
                    key={ca}
                    className="radio-item"
                >

                    <input

                        type="radio"

                        name="shift"

                        value={ca}

                        checked={
                            form.shift === ca
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

                    onChange={handleChange}

                />



                <NumberField

                    label="Thời gian thực tế"

                    name="actualTime"

                    value={form.actualTime}

                    onChange={()=>{}}

                />



                <NumberField

                    label="Thời gian trừ"

                    name="deductionTime"

                    value={form.deductionTime}

                    onChange={()=>{}}

                />





                <div className="select-box">


<div

className="select-title"

onClick={()=>setShowDeduction(!showDeduction)}

>

⏱ Chọn loại trừ thời gian

<span>
{
showDeduction ? "▲":"▼"
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

                    selectedDeduction.map(key=>{


                        const item=

                        deductionOptions.find(

                            x=>x.key===key

                        );


                        if(!item)

                            return null;



                        return (

                            <NumberField

                                key={key}

                                label={item.label}

                                name={key}

                                value={

                                    deductions[
                                    key as keyof typeof deductions
                                    ]

                                }

                                onChange={e=>

                                    updateDeductionValue(

                                        key,

                                        Number(
                                            e.target.value
                                        )

                                    )

                                }

                            />

                        );


                    })

                }


                </div>






                {

                    deductions.dungMay>0 &&


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

                    onChange={handleChange}

                />



                <NumberField

                    label="Thực tế"

                    name="actualOutput"

                    value={form.actualOutput}

                    onChange={handleChange}

                />


            </FormSection>









            {/* CHẤT LƯỢNG */}


            <FormSection title="Báo cáo chất lượng">



                <NumberField

                    label="TT OK"

                    name="ttOk"

                    value={form.ttOk}

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
showNg ? "▲":"▼"
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

                    selectedNg.map(key=>{


                        const item=

                        ngOptions.find(

                            x=>x.key===key

                        );



                        if(!item)

                            return null;



                        return (


                            <NumberField


                                key={key}


                                label={item.label}


                                name={key}


                                value={

                                    form[
                                    key as keyof typeof form
                                    ] as number

                                }


                                onChange={e=>

                                    handleNgValue(

                                        key,

                                        Number(
                                            e.target.value
                                        )

                                    )

                                }


                            />



                        );



                    })

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