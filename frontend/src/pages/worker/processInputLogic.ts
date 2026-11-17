import type { FormState } from "./processPageConfig";
import { clampWorkerWorkDate, shiftLocalDate } from "./processPageConfig";
import { resolveWorkDateForShiftChange } from "./processWorkDateLogic";

export function clearZeroNumberField(form: FormState, name: string, value: string): FormState {
  return value === "0" ? { ...form, [name]: "" } : form;
}

export function updateTotalTimeField(form: FormState, value: string): FormState {
  return { ...form, totalTime: value };
}

/** Pure form transition; React handlers should only dispatch state changes. */
export function applyProcessFormChange(
  previous: FormState,
  name: string,
  value: string,
  calculateActualOutput: (form: FormState) => number,
): FormState {
  const next = { ...previous, [name]: value } as FormState;

  if (name === "shift") {
    next.workDate = resolveWorkDateForShiftChange({
      currentWorkDate: previous.workDate,
      previousShift: previous.shift,
      nextShift: value,
      shiftDate: shiftLocalDate,
      clampDate: clampWorkerWorkDate,
    });
  }

  if (name === "ttOk" || name === "ttNg") {
    next.actualOutput = String(calculateActualOutput(next));
  }

  return name === "totalTime" ? updateTotalTimeField(next, value) : next;
}
