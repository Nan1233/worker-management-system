import { useEffect } from "react";
import ManagerReportGrid from "./ManagerReportGrid";

/**
 * Excel-style manager grid wrapper.
 * Keep numeric cells editable without the browser/controlled-input combination
 * turning an empty field into 0 before the next digit is typed (e.g. 04).
 */
export default function ManagerExcelReports() {
  useEffect(() => {
    const normalizeNumericInput = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (target.type !== "number" || !target.classList.contains("manager-excel-input")) return;

      const value = target.value;
      if (/^0\d+/.test(value)) {
        target.value = value.replace(/^0+(?=\d)/, "");
      }
    };

    document.addEventListener("input", normalizeNumericInput, true);
    return () => document.removeEventListener("input", normalizeNumericInput, true);
  }, []);

  return <ManagerReportGrid />;
}
