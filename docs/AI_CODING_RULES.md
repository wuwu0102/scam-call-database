# AI Coding Rules

## Purpose

These rules keep AI-assisted changes safe for ScamCall MX / scam-call-database.

The repository contains public data and public website assets. AI tools must avoid accidental data corruption or website breakage.

## Golden Rules

1. Protect the database.
2. Protect the website.
3. Protect public URLs.
4. Protect app compatibility.
5. Make minimal changes.
6. Do not over-engineer.
7. Do not add dependencies unless requested.
8. Do not modify generated files unless requested.
9. Do not change schemas unless requested.
10. Always explain changed and untouched files.

## Database Rules

- Do not edit phone-number data unless the task explicitly asks for data changes.
- Do not normalize numbers automatically.
- Do not remove duplicates automatically.
- Do not change +52 / Mexico phone handling automatically.
- Do not change file names used by the app.
- Do not change field names used by the app.
- Do not regenerate database outputs unless explicitly requested.

## Website Rules

- Do not change visual design unless requested.
- Do not change public copy unless requested.
- Do not remove Spanish (Mexico) text.
- Do not remove privacy text.
- Do not break GitHub Pages.
- Do not add tracking scripts.
- Keep the website fast and mobile-friendly.

## Workflow Rules

- Inspect before editing.
- Change only the requested files.
- Prefer documentation-only changes for governance tasks.
- Avoid formatting-only diffs.
- Avoid broad refactors.
- Summarize modified files.
- Mention anything intentionally left untouched.
