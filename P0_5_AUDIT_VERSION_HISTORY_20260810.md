# P0.5 - Temp report audit & version history

## Changes
- Added full temp report snapshot loader including defects, deductions, machine lines and machine defects.
- Create immutable temp report version on CREATE, UPDATE, RESUBMIT, REJECT and APPROVE lifecycle milestones.
- Fixed productionTempUpdateModel to use the current `report_edit_logs` schema:
  `user_id`, `old_data`, `new_data`, `changed_fields`, `note`.
- Removed obsolete legacy columns `changed_by`, `field_name`, `old_value`, `new_value`, `reason` from runtime INSERTs.
- A temp edit now stores one consolidated before/after audit record per transaction.
- Worker resubmission after rejection is explicitly logged as `RESUBMIT` / `TEMP_REPORT_RESUBMITTED`.
- Added regression tests for lifecycle versioning, schema compatibility and full child-detail snapshots.

## Verification
- Backend tests: 106/106 PASS
- Backend source check: PASS
- Desktop check: PASS
- Excel <-> DB source contract: PASS
