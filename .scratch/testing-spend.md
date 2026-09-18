# Testing spend

Budget: $3, owner-set. Roughly $1.29 known spent — $1.21 estimated across 11
calibration runs (Sep 2026) plus $0.077 measured during live verification.

The local figure is a standard-price estimate, not billing truth. Check real usage at <https://openrouter.ai/activity> or the key meter before assuming headroom.

Before any paid run:

- One request at a time, zero automatic retries.
- Worst case is about $0.24 per request at the 20,000-token output cap and the 16,000-byte admission bound, so a full 30-call calibration no longer fits the remaining budget.
- A non-streaming disconnect still gets charged. Capture the generation ID even when parsing or validation fails; never record a missing cost as $0.
- `mise run calibrate:live` preflights this: pass previous spend via `CALIBRATION_SPENT_USD` and it refuses a run that would cross $3. Do not get around it by reporting a lower number.
