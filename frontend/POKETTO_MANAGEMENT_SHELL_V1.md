# Poketto Management Shell V1

The actual `ManagementLayout` used by `/lead`, `/manager`, and `/admin` has been migrated to the real Poketto Stack sidebar primitives.

Business routes, permission checks, role routing, notification badge, logout and existing page components remain intact.
This removes the previous parallel Lead shell and makes the actual Lead/Manager/Admin routes render through the shared Poketto shell.
