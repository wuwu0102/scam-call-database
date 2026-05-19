# Release Checklist

Use this checklist before publishing changes.

## Data Safety

- [ ] Phone-number database files were not unintentionally modified.
- [ ] JSON / CSV / TXT exports were not unintentionally modified.
- [ ] Generated files were not overwritten.
- [ ] Phone number formats were not changed.
- [ ] Mexico +52 handling was not changed.
- [ ] Field names and schemas were not changed.

## Website Safety

- [ ] GitHub Pages still loads.
- [ ] Public URLs are unchanged.
- [ ] Website search still works if applicable.
- [ ] Mobile layout still works.
- [ ] Spanish (Mexico) text is preserved.
- [ ] Privacy/disclaimer text is preserved.

## App Compatibility

- [ ] iOS app database URL is unchanged.
- [ ] App-facing file names are unchanged.
- [ ] App-facing response format is unchanged.
- [ ] Existing users can still fetch the database.

## Automation Safety

- [ ] Existing GitHub Actions workflows are unchanged unless intentionally edited.
- [ ] No update schedule was changed unintentionally.
- [ ] No secrets or tokens were added.
- [ ] No script regenerates data unexpectedly.

## Documentation

- [ ] README links are still valid.
- [ ] AI rules are updated if workflow changed.
- [ ] Changed files are summarized.
