type Props = {

    label: string;

    name: string;

    value: string;

    type?: string;

    onChange: (
        e: React.ChangeEvent<HTMLInputElement>
    ) => void;

};

function InputField({

    label,

    name,

    value,

    onChange,

    type = "text",

}: Props) {

    return (

        <div className="input-group">

            <label>{label}</label>

            <input
                type={type}
                name={name}
                value={value}
                onChange={onChange}
            />

        </div>

    );

}

export default InputField;