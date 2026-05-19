# AGENTS.md

This repository powers ScamCall MX / scam-call-database.

These instructions are high priority for AI coding agents working in this repository.

## Core Rule

Protect the existing phone-number database and public website.

Do not modify data, website behavior, deployment, or automation unless the user explicitly asks for it.

## Do Not Touch Without Explicit Request

- Phone number database files
- JSON, CSV, TXT, or generated data files
- Public website HTML, CSS, and JavaScript
- GitHub Pages configuration
- Existing GitHub Actions workflows
- Privacy policy
- Existing app-facing endpoints
- Existing file names used by the iOS app
- Existing URL paths used by users or the app

## Safe Default Behavior

When asked to improve the project:

1. Read the repository structure first.
2. Identify the smallest safe change.
3. Prefer documentation-only changes when the user asks for rules or process improvements.
4. Do not reformat unrelated files.
5. Do not rename routes, files, folders, or public URLs.
6. Do not introduce new dependencies unless explicitly requested.
7. Do not change data schemas unless explicitly requested.
8. Do not change automation schedules unless explicitly requested.
9. Preserve backward compatibility for the iOS app and GitHub Pages website.
10. Summarize every changed file.

## Data Safety Rules

- Never delete phone records.
- Never bulk-normalize phone numbers without explicit approval.
- Never deduplicate the database unless explicitly requested.
- Never change country-code handling unless explicitly requested.
- Never change Mexico +52 handling unless explicitly requested.
- Never overwrite generated files without confirming the generation source.
- Never expose private tokens, API keys, or secrets.

## Website Safety Rules

- Keep the current public website working.
- Do not break GitHub Pages.
- Do not change public URLs.
- Do not remove Spanish (Mexico) content.
- Do not remove privacy or disclaimer text.
- Do not add tracking scripts unless explicitly requested.
- Keep the site lightweight and mobile-friendly.

## App Compatibility Rules

The iOS app may depend on existing database files, URL paths, field names, and response formats.

Before changing any public file or schema, identify:
- Which app or website may consume it
- Whether the change is backward compatible
- How to test old and new behavior

## AI Coding Style

- Keep changes minimal.
- Avoid unnecessary abstractions.
- Avoid large rewrites.
- Avoid heavy dependencies.
- Prefer simple scripts and clear documentation.
- Keep Spanish (Mexico) as the primary public-facing language unless asked otherwise.
- Use Traditional Chinese comments only when the file already uses Chinese or the user requests it.

## Required Final Response

After any change, report:

1. Files changed
2. What changed
3. What was intentionally not changed
4. Whether database files were untouched
5. Whether website files were untouched
6. Whether GitHub Pages / Actions were untouched
7. How to verify safely
