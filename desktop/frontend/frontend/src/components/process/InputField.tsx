interface InputFieldProps {

    label: string;

    name: string;

    value: string;

    type?: string;

    placeholder?: string;

    required?: boolean;

    readOnly?: boolean;

    disabled?: boolean;

    onChange?: (
        event: React.ChangeEvent<HTMLInputElement>
    ) => void;

}


function InputField({

    label,

    name,

    value,

    type = "text",

    placeholder,

    required = false,

    readOnly = false,

    disabled = false,

    onChange

}: InputFieldProps) {

    return (

        <div className="input-group">

            <label htmlFor={name}>

                {label}

                {
                    required && (
                        <span className="required">
                            *
                        </span>
                    )
                }

            </label>


            <input

                id={name}

                type={type}

                name={name}

                value={value}

                placeholder={placeholder}

                required={required}

                readOnly={readOnly}

                disabled={disabled}

                onChange={onChange}

            />

        </div>

    );

}


export default InputField;