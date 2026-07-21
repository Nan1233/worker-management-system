type Props = {
    label: string;
    name: string;
    value: string;
    options: string[];

    onChange: (
        e: React.ChangeEvent<HTMLSelectElement>
    ) => void;
};

function SelectField({
    label,
    name,
    value,
    options,
    onChange,
}: Props) {

    return (

        <div className="input-group">

            <label>{label}</label>

            <select
                name={name}
                value={value}
                onChange={onChange}
            >

                {options.map((item) => (

                    <option
                        key={item}
                        value={item}
                    >
                        {item}
                    </option>

                ))}

            </select>

        </div>

    );

}

export default SelectField;