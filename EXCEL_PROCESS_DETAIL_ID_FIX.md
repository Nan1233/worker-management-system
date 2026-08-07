# Excel detail columns by process

- Always load active deduction and defect master types for each process, including months without approved reports.
- Match report detail values to columns by `deduction_type_id` and `defect_type_id`.
- Fall back to type code and normalized label only for legacy payloads without IDs.
- Keep separate deduction and defect columns for CAN, EP, XLBV, GC, MAI, DO, K1, K2 and SX3.
- Preserve zero-valued columns when a configured type has no occurrence in a report.
