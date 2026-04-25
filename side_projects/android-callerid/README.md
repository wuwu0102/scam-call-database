# Android Caller ID / Call Screening (Future Native Layer)

This folder documents the Android caller ID direction for future implementation.

## Scope in this task

- Repository planning and compatibility notes only.
- No full native Android caller-ID service implementation yet.

## Key direction

- Flutter UI can share business logic for lookup/report.
- Incoming-call caller ID integration requires Android native layer.

## Future implementation options

1. `CallScreeningService`-based integration for screening/identification behavior.
2. Default phone app role and Android permission limitations handling.
3. Google Play policy/security review before production rollout.

## Important note

Do not treat this folder as a completed Android caller ID implementation.
It is a scaffold/plan placeholder for later native work.
