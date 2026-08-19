# Shared machine accounting

Physical machine truth is stored once in the machine production event. Worker machine-line `counted_output` = canonical worker credited output and `machine_time_hours` = canonical worker participation time. SUM(worker credited output) is not constrained to equal machine physical output. Never assume equal split. A machine may produce 1000 physical units while A and B each receive 1000 credit. Event identity uses a surrogate ID so Product X run 1 + Product X run 2 are distinct events.
