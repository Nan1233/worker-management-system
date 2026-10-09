/**
 * Pure click-handler logic for the worker "Nộp dữ liệu" button, kept out of
 * ProcessSubmitActions.tsx (which has JSX and can't be imported by a plain
 * Node test) so the real behavior can be executed in a test, not just
 * pattern-matched in source.
 *
 * One click submits immediately: no second "Xác nhận nộp" confirmation step,
 * no network round trip in between. The only guard is the in-flight submit
 * lock (`submitting`); the worker's actual-time / 12h-per-day cap and every
 * other business rule still run inside `onSubmit` (ProcessPage.tsx:
 * handleSubmit → frontend validateForm() → backend validateProductionReport /
 * enforceDailyHoursLocked), which this function does not touch or bypass.
 */
export const handleProcessSubmitClick = (submitting: boolean, onSubmit: () => void): void => {
    if (submitting) return;
    onSubmit();
};
