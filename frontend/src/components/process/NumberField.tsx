type Props = {

    label: string;

    name: string;

    value: string | number;

    allowDecimal?: boolean;

    onChange: (
        event: React.ChangeEvent<HTMLInputElement>
    ) => void;

    onBlur?: (
        event: React.FocusEvent<HTMLInputElement>
    ) => void;

    onKeyDown?: (
        event: React.KeyboardEvent<HTMLInputElement>
    ) => void;

};


function NumberField({

    label,

    name,

    value,

    allowDecimal = false,

    onChange,

    onBlur,

    onKeyDown

}: Props) {


    const handleInput = (
        event: React.ChangeEvent<HTMLInputElement>
    ) => {

        const inputValue =
            event.target.value;


        if (!allowDecimal) {

            if (
                inputValue !== ""
                &&
                !/^\d*$/.test(inputValue)
            ) {

                return;

            }

        }
        else {

            if (
                inputValue !== ""
                &&
                !/^\d*\.?\d*$/.test(inputValue)
            ) {

                return;

            }

        }


        onChange(event);

    };


    const handleInternalKeyDown = (
        event: React.KeyboardEvent<HTMLInputElement>
    ) => {

        /*
            Gọi xử lý riêng được truyền từ ProcessPage.

            Ví dụ:
            - nhập 0
            - nhấn Enter
            - bỏ lựa chọn và ẩn ô
        */
        if (onKeyDown) {

            onKeyDown(event);

        }


        /*
            Nếu ProcessPage đã gọi preventDefault,
            không chạy tiếp logic bên dưới.
        */
        if (event.defaultPrevented) {

            return;

        }


        if (
            event.key === "Enter"
            ||
            event.key === "Tab"
        ) {

            if (onBlur) {

                const target =
                    event.currentTarget;


                onBlur(
                    {
                        target,
                        currentTarget: target
                    } as React.FocusEvent<HTMLInputElement>
                );

            }

        }

    };


    return (

        <div className="input-group">

            <label htmlFor={name}>

                {label}

            </label>


            <input

                id={name}

                name={name}

                type="text"

                inputMode={
                    allowDecimal
                        ? "decimal"
                        : "numeric"
                }

                value={
                    value ?? ""
                }

                onChange={
                    handleInput
                }

                onBlur={
                    onBlur
                }

                onKeyDown={
                    handleInternalKeyDown
                }

                autoComplete="off"

            />

        </div>

    );

}


export default NumberField;
