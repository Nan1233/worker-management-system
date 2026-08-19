# Full Web Cleanup V3 — compiler-safe restore

The V2 import cleanup removed type imports that TypeScript still required in type positions.
This revision restores the affected files from the known-good V3 build baseline and preserves any
Manager Poketto visual hook that existed in the current source.

No API/business logic changes were introduced.
