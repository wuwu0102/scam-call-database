# Prompt Templates

## Safe Documentation Update

Please update documentation only.
Do not modify database files, website files, GitHub Actions, GitHub Pages settings, or app-facing endpoints.
Keep the change minimal.
Summarize changed files and confirm protected files were untouched.

## Safe Bug Fix

Find the smallest fix for the reported bug.
Do not rewrite the project.
Do not modify phone-number data.
Do not change public URLs or schemas.
Do not add dependencies.
Explain the root cause, changed files, and manual test steps.

## Website Copy Update

Update only the requested text.
Preserve Spanish (Mexico) tone.
Do not change layout, JavaScript behavior, database files, or deployment settings.
Confirm public URLs and database files were untouched.

## Database Change Request

Before editing data, identify:
- Source file
- Generated files
- App-facing outputs
- Current schema
- Backup or rollback method
- Exact records to change

Do not perform bulk changes unless explicitly requested.

## GitHub Actions Change Request

Before editing workflows, identify:
- Existing workflow names
- Trigger conditions
- Secrets used
- Files generated or deployed
- Rollback method

Do not change schedules or deployment behavior unless explicitly requested.
