const isReportNumberInput = (target: EventTarget | null): target is HTMLInputElement => {
    return target instanceof HTMLInputElement
        && target.type === "number"
        && Boolean(target.closest(".edit-report-card"));
};

const normalizeLeadingZeros = (input: HTMLInputElement) => {
    const raw = input.value;
    if (!raw || !/^\d+$/.test(raw) || raw.length <= 1) return;
    const normalized = raw.replace(/^0+(?=\d)/, "");
    if (normalized === raw) return;
    input.value = normalized;
    input.dispatchEvent(new Event("input", { bubbles: true }));
};

export const installReportNumberInputFix = () => {
    const focusHandler = (event: FocusEvent) => {
        const target = event.target;
        if (!isReportNumberInput(target)) return;
        // Selecting the old value prevents typing a replacement such as 20
        // from becoming 020 when the existing value is 0.
        window.requestAnimationFrame(() => {
            if (document.activeElement === target) target.select();
        });
    };

    const inputHandler = (event: Event) => {
        const target = event.target;
        if (!isReportNumberInput(target)) return;
        normalizeLeadingZeros(target);
    };

    document.addEventListener("focusin", focusHandler);
    document.addEventListener("input", inputHandler);

    return () => {
        document.removeEventListener("focusin", focusHandler);
        document.removeEventListener("input", inputHandler);
    };
};

installReportNumberInputFix();
