# Verify fix 2026-08-07

Fixed the frontend lint issues reported by `npm --prefix frontend run check`:

1. `AutocompleteInput.tsx`
   - Removed stale `react-hooks/set-state-in-effect` eslint-disable directive.

2. `FormulaSettings.tsx`
   - Wrapped the initial loader in `useCallback`.
   - The initial load now selects `GLOBAL` (or the first available scope) without capturing `selectedScope`.
   - `useEffect` depends on the stable `load` callback, satisfying `react-hooks/exhaustive-deps` without creating a refetch loop when the selected scope changes.

3. `ProcessPage.tsx`
   - Removed the unused `calculateCountedNg` wrapper.
   - Removed the now-unused `calculateCountedNg` utility alias import.

4. `ProductionHistory.tsx`
   - Removed stale `react-hooks/set-state-in-effect` eslint-disable directive.

Static checks performed after edit:
- Removed symbol has no remaining references.
- Target stale eslint-disable directives have no remaining references.
- Brace/parenthesis balance is valid in all four edited TS/TSX files.

Run on the Windows repository before committing:

```cmd
cd /d C:\VSCode\worker-management-system
npm run verify
```
