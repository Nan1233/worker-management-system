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

    value,

    allowDecimal = false,

    onChange,

}: Props) {



    const handleInput = (
        e: React.ChangeEvent<HTMLInputElement>
    ) => {


        const inputValue = e.target.value;



        // số nguyên
        if(!allowDecimal){


            if(
                inputValue !== "" &&
                !/^\d*$/.test(inputValue)
            ){

                return;

            }


        }



        // số thập phân
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