import {
    useEffect,
    useMemo,
    useRef,
    useState
} from "react";

export interface AutocompleteOption {

    value: string;

    label?: string;

    description?: string;

}


interface AutocompleteInputProps {

    id: string;

    label: string;

    value: string;

    options: AutocompleteOption[];

    placeholder?: string;

    required?: boolean;

    disabled?: boolean;

    emptyMessage?: string;

    onChange: (
        value: string
    ) => void;

    onSelect: (
        option: AutocompleteOption
    ) => void;

}


function AutocompleteInput({

    id,

    label,

    value,

    options,

    placeholder = "Nhập để tìm kiếm...",

    required = false,

    disabled = false,

    emptyMessage = "Không tìm thấy dữ liệu",

    onChange,

    onSelect

}: AutocompleteInputProps) {

    const wrapperRef =
        useRef<HTMLDivElement | null>(
            null
        );


    const [
        open,
        setOpen
    ] = useState(false);


    const [
        activeIndex,
        setActiveIndex
    ] = useState(-1);


    const filteredOptions =
        useMemo(() => {

            const keyword =
                value
                    .trim()
                    .toLowerCase();


            const result =
                keyword

                    ? options.filter(
                        (option) => {

                            const searchText = [

                                option.value,

                                option.label
                                ??
                                "",

                                option.description
                                ??
                                ""

                            ]
                                .join(" ")
                                .toLowerCase();


                            return searchText.includes(
                                keyword
                            );

                        }
                    )

                    : options;


            return result.slice(
                0,
                50
            );

        }, [
            options,
            value
        ]);


    useEffect(() => {

        const handleClickOutside = (
            event: MouseEvent | TouchEvent
        ) => {

            const target =
                event.target;


            if (
                !(target instanceof Node)
            ) {

                return;

            }


            if (
                wrapperRef.current
                &&
                !wrapperRef.current.contains(
                    target
                )
            ) {

                setOpen(
                    false
                );

                setActiveIndex(
                    -1
                );

            }

        };


        document.addEventListener(
            "mousedown",
            handleClickOutside
        );


        document.addEventListener(
            "touchstart",
            handleClickOutside
        );


        return () => {

            document.removeEventListener(
                "mousedown",
                handleClickOutside
            );


            document.removeEventListener(
                "touchstart",
                handleClickOutside
            );

        };

    }, []);


    useEffect(() => {

        // Giá trị thay đổi thì bỏ lựa chọn bàn phím cũ.
        setActiveIndex(
            -1
        );

    }, [value]);


    const handleSelect = (
        option: AutocompleteOption
    ) => {

        onSelect(
            option
        );


        setOpen(
            false
        );


        setActiveIndex(
            -1
        );

    };


    const handleKeyDown = (
        event:
            React.KeyboardEvent<HTMLInputElement>
    ) => {

        if (
            event.key ===
            "ArrowDown"
        ) {

            event.preventDefault();


            setOpen(
                true
            );


            setActiveIndex(
                (prev) => {

                    if (
                        filteredOptions.length
                        ===
                        0
                    ) {

                        return -1;

                    }


                    const next =
                        prev + 1;


                    return next
                        >=
                        filteredOptions.length

                            ? 0

                            : next;

                }
            );


            return;

        }


        if (
            event.key ===
            "ArrowUp"
        ) {

            event.preventDefault();


            setOpen(
                true
            );


            setActiveIndex(
                (prev) => {

                    if (
                        filteredOptions.length
                        ===
                        0
                    ) {

                        return -1;

                    }


                    if (
                        prev <= 0
                    ) {

                        return (
                            filteredOptions.length
                            -
                            1
                        );

                    }


                    return prev - 1;

                }
            );


            return;

        }


        if (
            event.key ===
            "Enter"
        ) {

            if (
                open
                &&
                activeIndex >= 0
                &&
                filteredOptions[
                    activeIndex
                ]
            ) {

                event.preventDefault();


                handleSelect(
                    filteredOptions[
                        activeIndex
                    ]
                );

            }


            return;

        }


        if (
            event.key ===
            "Escape"
        ) {

            setOpen(
                false
            );

            setActiveIndex(
                -1
            );

        }

    };


    return (

        <div
            ref={wrapperRef}
            className="autocomplete-field"
        >

            <label
                className="autocomplete-label"
                htmlFor={id}
            >

                {label}


                {
                    required
                    && (

                        <em>
                            *
                        </em>

                    )
                }

            </label>


            <div className="autocomplete-input-wrapper">

                <input
                    id={id}
                    className="autocomplete-input"
                    value={value}
                    placeholder={placeholder}
                    disabled={disabled}
                    autoComplete="off"
                    onFocus={() =>
                        setOpen(
                            true
                        )
                    }
                    onClick={() =>
                        setOpen(
                            true
                        )
                    }
                    onChange={(event) => {

                        onChange(
                            event.target.value
                        );


                        setOpen(
                            true
                        );

                    }}
                    onKeyDown={
                        handleKeyDown
                    }
                />


                <span className="autocomplete-search-icon">

                    ⌕

                </span>

            </div>


            {
                open
                &&
                !disabled
                && (

                    <div
                        className="autocomplete-menu"
                        role="listbox"
                    >

                        {
                            filteredOptions.length
                            >
                            0

                                ? filteredOptions.map(
                                    (
                                        option,
                                        index
                                    ) => (

                                        <button
                                            key={
                                                `${option.value}-${index}`
                                            }
                                            type="button"
                                            className={
                                                index
                                                ===
                                                activeIndex

                                                    ? "autocomplete-option active"

                                                    : "autocomplete-option"
                                            }
                                            onMouseDown={(event) =>
                                                event.preventDefault()
                                            }
                                            onClick={() =>
                                                handleSelect(
                                                    option
                                                )
                                            }
                                        >

                                            <span className="autocomplete-option-main">
    {option.value}
</span>

{option.label &&
    option.label.trim().toLowerCase() !==
        option.value.trim().toLowerCase() && (
        <span className="autocomplete-option-label">
            {option.label}
        </span>
    )}


                                            {
                                                option.description
                                                && (

                                                    <span className="autocomplete-option-description">

                                                        {
                                                            option.description
                                                        }

                                                    </span>

                                                )
                                            }

                                        </button>

                                    )
                                )

                                : (

                                    <div className="autocomplete-empty">

                                        {
                                            emptyMessage
                                        }

                                    </div>

                                )
                        }

                    </div>

                )
            }

        </div>

    );

}


export default AutocompleteInput;