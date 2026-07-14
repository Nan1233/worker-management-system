type Props = {
    label: string;
    name: string;
    value: string | number;

    allowDecimal?: boolean;

    onChange: (
        e: React.ChangeEvent<HTMLInputElement>
    ) => void;

    onBlur?: (
        e: React.FocusEvent<HTMLInputElement>
    ) => void;
};



function NumberField({

    label,
    name,
    value,
    allowDecimal = false,
    onChange,
    onBlur,

}: Props){



const handleInput = (
    e: React.ChangeEvent<HTMLInputElement>
)=>{

    const inputValue = e.target.value;


    if(!allowDecimal){

        if(
            inputValue !== "" &&
            !/^\d*$/.test(inputValue)
        ){

            return;

        }

    }
    else{

        if(
            inputValue !== "" &&
            !/^\d*\.?\d*$/.test(inputValue)
        ){

            return;

        }

    }


    onChange(e);

};





const handleKeyDown = (
    e:React.KeyboardEvent<HTMLInputElement>
)=>{

    if(
        e.key==="Enter" ||
        e.key==="Tab"
    ){

        if(onBlur){

            const target =
            e.target as HTMLInputElement;


            onBlur(
                {
                    target
                } as React.FocusEvent<HTMLInputElement>
            );

        }

    }

};




return (

<div className="input-group">


<label>
{label}
</label>



<input

name={name}

type="text"

inputMode={
allowDecimal
?
"decimal"
:
"numeric"
}

value={value ?? ""}

onChange={handleInput}

onBlur={onBlur}

onKeyDown={handleKeyDown}

/>


</div>

);


}


export default NumberField;