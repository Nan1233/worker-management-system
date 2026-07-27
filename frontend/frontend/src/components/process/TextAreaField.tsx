type Props = {

    label: string;

    name: string;

    value: string;

    onChange: (
        e: React.ChangeEvent<HTMLTextAreaElement>
    ) => void;

};

function TextAreaField({

    label,

    name,

    value,

    onChange,

}: Props) {

    return (

        <div className="input-group">

            <label>{label}</label>

            <textarea
                rows={4}
                name={name}
                value={value}
                onChange={onChange}
            />

        </div>

    );

}

export default TextAreaField;