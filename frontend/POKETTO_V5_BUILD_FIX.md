# Poketto V5 build fix

Render reported that `KtcTable.tsx` imported `../../poketto-template/ui/table`,
but the supplied Poketto template does not contain a `table.tsx` primitive.

The incorrect wrapper was removed. No custom/fake Table component was introduced.
Future data tables must use the table implementation that actually exists in the
KTC source or be built from real Poketto primitives only after confirming the
supplied template provides them.

No business logic/API/auth/permission/Approve/Reject changes.
