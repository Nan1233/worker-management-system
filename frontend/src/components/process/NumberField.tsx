type Props = {
    label: string;
    name: string;
    value: string | number;

    onChange: (
        e: React.ChangeEvent<HTMLInputElement>
    ) => void;
};


function NumberField({

    label,

    name,

    value,

    onChange,

}: Props) {


return (

<div className="input-group">


<label>
    {label}
</label>



<input

    type="number"

    step="0.1"

    name={name}

    value={value}

    onChange={onChange}

/>


</div>

);


}


export default NumberField;