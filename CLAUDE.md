# CLAUDE.md

This file provides instructions for Claude Code and other AI coding tools.

## Project Identity

ScamCall MX / scam-call-database is a public suspicious phone-number database and website for Mexico-focused caller identification.

The project may be consumed by:
- GitHub Pages website
- iOS caller ID app
- Remote database fetch logic
- Public users

## Main Priority

Do not break the existing database or public website.

## Minimal Change Policy

When editing this repository:

- Make the smallest possible change.
- Do not rewrite working code.
- Do not modify unrelated files.
- Do not reformat files for style only.
- Do not add dependencies.
- Do not change public paths.
- Do not change data formats.
- Do not change automation unless explicitly requested.

## Protected Areas

Do not touch these areas unless explicitly requested:

- data files
- generated database files
- phone number lists
- JSON / CSV / TXT exports
- public website files
- privacy policy
- GitHub Actions workflows
- GitHub Pages settings
- app-facing endpoints

## Data Integrity Rules

- Preserve phone number records.
- Preserve existing field names.
- Preserve existing file names.
- Preserve existing URL paths.
- Preserve Mexico +52 handling.
- Do not deduplicate, normalize, or filter records unless explicitly requested.

## Website Rules

- Preserve current site behavior.
- Preserve Spanish (Mexico) wording unless asked to edit copy.
- Preserve mobile usability.
- Preserve disclaimers and privacy-related text.
- Avoid adding analytics or tracking.

## Safe Work Types

Safe tasks include:

- Adding documentation
- Adding AI coding rules
- Adding release checklist
- Adding prompt templates
- Adding non-invasive comments
- Adding validation scripts only when explicitly requested

## Before Editing

Check:
1. What files exist
2. Which files are public-facing
3. Which files are generated
4. Which files are consumed by the app
5. Whether the requested change can be documentation-only

## After Editing

Run only safe checks available in the repo.
Do not run scripts that regenerate or overwrite database files unless explicitly requested.

Final response must clearly state whether data and website files were untouched.
