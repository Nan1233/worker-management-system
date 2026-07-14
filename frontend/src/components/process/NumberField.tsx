type Props = {
    label: string;
    name: string;
    value: string | number;

    allowDecimal?: boolean;

    onChange: (
        e: React.ChangeEvent<HTMLInputElement>
    ) => void;
};


function NumberField({

    label,

    name,

    value,

    allowDecimal = false,

    onChange,

}: Props) {


    const handleInput = (
        e: React.ChangeEvent<HTMLInputElement>
    ) => {


        const value = e.target.value;


        // cho phép số nguyên
        if(!allowDecimal){

            if(
                value !== "" &&
                !/^\d*$/.test(value)
            ){
                return;
            }

        }


        // cho phép số thập phân
        else{

            if(
                value !== "" &&
                !/^\d*\.?\d*$/.test(value)
            ){
                return;
            }

        }


        onChange(e);

    };



    return (

        <div className="input-group">


            <label>

                {label}

            </label>



            <input

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

            />


        </div>

    );

}


export default NumberField;