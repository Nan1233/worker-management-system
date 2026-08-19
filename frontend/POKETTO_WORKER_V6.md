# Worker V6 — route integration

The Poketto Worker pages are now reachable through explicit template routes and the Worker shell navigation points to them.

Original KTC routes are preserved; template routes use `*-template` suffixes so business pages are not overwritten.
This is intentionally reversible and does not modify backend, API, database, authentication, production validation, or Approve/Reject logic.
