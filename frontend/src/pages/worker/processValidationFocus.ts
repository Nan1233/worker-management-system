// Shared validation-focus behavior for the worker production form.
// Keep error-to-field routing outside the large ProcessPage component.
export function focusProcessValidationTarget(
    message: string,
    usesMultiMachineLines: boolean,
    setShowNg: (value: boolean) => void,
    setShowDeduction: (value: boolean) => void,
) {
        const normalized = message.toLowerCase();
        let selector = "";

        if (normalized.includes("ngày làm việc")) selector = "#workerWorkDate";
        else if (normalized.includes("ca làm việc")) selector = 'input[name="shift"]';
        else if (normalized.includes("sản phẩm")) selector = usesMultiMachineLines ? '#machineProduct-0' : '#productName';
        else if (normalized.includes("máy")) selector = usesMultiMachineLines ? '#machineNo-0' : '#machineNo';
        else if (normalized.includes("thời gian") || normalized.includes("số phút")) selector = '.worker-time-parts input';
        else if (normalized.includes("tt ok") || normalized.includes("sản lượng")) selector = '#ttOk';
        else if (/\\btt ng\\b|\\blỗi ng\\b|\\btổng ng\\b/i.test(normalized)) selector = '#ttNg';

        // Match NG as a separate business abbreviation, not the letters inside
        // "ngày", "ngừng" or "đang"; otherwise unrelated validation errors
        // unexpectedly expand the quality panel on mobile.
        if (/(?:^|[^a-z])(?:tt ng|lỗi ng|tổng ng|ng)(?:$|[^a-z])/i.test(normalized)) setShowNg(true);
        if (normalized.includes("trừ")) setShowDeduction(true);

        if (!selector) return;
        window.setTimeout(() => {
            const element = document.querySelector<HTMLElement>(selector);
            element?.focus({ preventScroll: true });
            element?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 30);
}
