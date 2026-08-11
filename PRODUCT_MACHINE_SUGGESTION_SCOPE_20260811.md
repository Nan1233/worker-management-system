# Product / machine suggestion scope — 2026-08-11

Worker product autocomplete now follows the KTC selection hierarchy:

1. process
2. GC operation type (CUT/LONG) where applicable
3. MANUAL/MACHINE mode
4. selected machine
5. product search keyword

GC encoded variants are interpreted as factory metadata:
- `-1`, `-9`, ... => numbered machine variant
- `-auto` => automatic-machine variant
- unsuffixed family code => manual/base variant when that family has machine variants

For other machine processes, `product_machine_standards` / eligible machine codes are authoritative whenever configured.
Single-machine forms now require selecting the machine before product search. Changing a machine clears a previously-selected product. Multi-machine lines validate each product against that line's own machine.

Backend validation also rejects incompatible product/machine combinations and GC manual use of machine-specific suffixes.
