/**
 * Pure click-handler logic for the worker "Nộp dữ liệu" button, kept out of
 * ProcessSubmitActions.tsx (which has JSX and can't be imported by a plain
 * Node test) so the real behavior can be executed in a test, not just
 * pattern-matched in source.
 *
 * One click submits immediately: no second "Xác nhận nộp" confirmation step,
 * no network round trip in between. The only guard is the in-flight submit
 * lock (`submitting`); backend business rules still run inside `onSubmit`.
 * The 12h/day worker cap applies only to processes outside the multi-machine
 * GC/MAI group; those processes are temporarily exempt pending a per-machine
 * time policy. This click helper does not alter or bypass backend validation.
 */
export const handleProcessSubmitClick = (submitting: boolean, onSubmit: () => void): void => {
    if (submitting) return;
    onSubmit();
};
