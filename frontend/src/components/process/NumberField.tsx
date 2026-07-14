type Props = {
    label: string;
    name: string;
    value: string | number;
    step?: string;
    allowDecimal?: boolean;

    onChange: (
        e: React.ChangeEvent<HTMLInputElement>
    ) => void;
};



function NumberField({

    label,
    name,
    value,
    step,
    allowDecimal = false,
    onChange,

}: Props) {


return (

<div className="input-group">


<label>
{label}
</label>



<input

type="text"

name={name}

inputMode="decimal"

value={value ?? ""}


onChange={(e)=>{


const val=e.target.value;


// cho phép rỗng khi đang nhập
if(val===""){
    onChange(e);
    return;
}


// thời gian cho phép số thập phân
if(allowDecimal){

    if(/^\d*\.?\d*$/.test(val)){
        onChange(e);
    }

}


// các số NG chỉ cho số nguyên
else{

    if(/^\d*$/.test(val)){
        onChange(e);
    }

}


}}


/>


</div>


);

}


export default NumberField;