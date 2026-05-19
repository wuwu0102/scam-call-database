# Project Guardrails

## Protected Project Areas

The following areas are considered sensitive:

- Phone-number database
- Generated data exports
- Public website files
- GitHub Pages configuration
- Existing GitHub Actions workflows
- Privacy policy
- iOS app database endpoints
- Public URL paths

## Why These Areas Are Protected

The iOS app and public users may depend on stable file names, response formats, and URLs.

Even small changes to data files, schema, or paths may break:
- Caller ID database updates
- Public search website
- App Store compliance materials
- Privacy policy links
- Social media links
- User bookmarks

## Safe Change Categories

Usually safe:

- Documentation
- AI rules
- Release checklist
- Prompt templates
- Non-invasive README links

Potentially risky:

- Data validation scripts
- Build scripts
- GitHub Actions
- Site copy changes
- CSS changes
- JavaScript behavior changes

High risk:

- Database edits
- Schema changes
- URL/path changes
- Generated file overwrites
- Privacy policy changes
- App-facing endpoint changes

## Review Questions Before Any Change

1. Could this affect the iOS app?
2. Could this affect GitHub Pages?
3. Could this change public URLs?
4. Could this change database content?
5. Could this change generated outputs?
6. Could this affect Spanish (Mexico) users?
7. Could this expose private data or secrets?

If the answer is yes or uncertain, do not change it without explicit user approval.
