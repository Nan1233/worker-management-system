import { useEffect, useMemo, useRef, useState } from "react";
import "./AutocompleteInput.css";

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
    onChange: (value: string) => void;
    onSelect: (option: AutocompleteOption) => void;
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
    onSelect,
}: AutocompleteInputProps) {
    const wrapperRef = useRef<HTMLDivElement | null>(null);
    const [open, setOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);

    const filteredOptions = useMemo(() => {
        const keyword = value.trim().toLowerCase();
        const result = keyword
            ? options.filter((option) =>
                [option.value, option.label ?? "", option.description ?? ""]
                    .join(" ")
                    .toLowerCase()
                    .includes(keyword)
            )
            : options;
        return result.slice(0, 50);
    }, [options, value]);

    useEffect(() => {
        const handleOutside = (event: MouseEvent | TouchEvent) => {
            const target = event.target;
            if (target instanceof Node && wrapperRef.current && !wrapperRef.current.contains(target)) {
                setOpen(false);
                setActiveIndex(-1);
            }
        };
        document.addEventListener("mousedown", handleOutside);
        document.addEventListener("touchstart", handleOutside);
        return () => {
            document.removeEventListener("mousedown", handleOutside);
            document.removeEventListener("touchstart", handleOutside);
        };
    }, []);

    useEffect(() => setActiveIndex(-1), [value]);

    const selectOption = (option: AutocompleteOption) => {
        onSelect(option);
        setOpen(false);
        setActiveIndex(-1);
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            setActiveIndex((prev) => filteredOptions.length ? (prev + 1) % filteredOptions.length : -1);
        } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            setActiveIndex((prev) => filteredOptions.length ? (prev <= 0 ? filteredOptions.length - 1 : prev - 1) : -1);
        } else if (event.key === "Enter" && open && activeIndex >= 0 && filteredOptions[activeIndex]) {
            event.preventDefault();
            selectOption(filteredOptions[activeIndex]);
        } else if (event.key === "Escape") {
            setOpen(false);
            setActiveIndex(-1);
        }
    };

    return (
        <div ref={wrapperRef} className="autocomplete-field">
            <label className="autocomplete-label" htmlFor={id}>
                {label}{required && <em>*</em>}
            </label>
            <div className="autocomplete-input-wrapper">
                <input
                    id={id}
                    className="autocomplete-input"
                    value={value}
                    placeholder={placeholder}
                    disabled={disabled}
                    autoComplete="off"
                    onFocus={() => setOpen(true)}
                    onClick={() => setOpen(true)}
                    onChange={(event) => {
                        onChange(event.target.value);
                        setOpen(true);
                    }}
                    onKeyDown={handleKeyDown}
                />
                <span className="autocomplete-search-icon">⌕</span>
            </div>
            {open && !disabled && (
                <div className="autocomplete-menu" role="listbox">
                    {filteredOptions.length > 0 ? filteredOptions.map((option, index) => (
                        <button
                            key={`${option.value}-${index}`}
                            type="button"
                            className={index === activeIndex ? "autocomplete-option active" : "autocomplete-option"}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => selectOption(option)}
                        >
                            <span className="autocomplete-option-main">{option.value}</span>
                            {option.label && option.label.trim().toLowerCase() !== option.value.trim().toLowerCase() && (
                                <span className="autocomplete-option-label">{option.label}</span>
                            )}
                            {option.description && (
                                <span className="autocomplete-option-description">{option.description}</span>
                            )}
                        </button>
                    )) : (
                        <div className="autocomplete-empty">{emptyMessage}</div>
                    )}
                </div>
            )}
        </div>
    );
}

export default AutocompleteInput;
