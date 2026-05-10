# AGENTS.md

## Project Goal

This project powers Alerta Número MX / ScamCall MX, a Mexico-focused suspicious phone number lookup platform.

The website is a lightweight public landing page and lookup tool hosted on GitHub Pages.

The iOS app ScamCall MX is an optional advanced experience for iPhone users.

## Core Rules

1. Do not rewrite the project from scratch.
2. Do not remove existing data files.
3. Do not break GitHub Pages deployment.
4. Do not introduce backend requirements unless explicitly requested.
5. Do not expose API keys, tokens, or secrets in frontend code.
6. Keep the site mobile-first and simple.
7. Prefer small, safe, reversible changes.
8. Preserve existing working behavior before adding new features.
9. If unsure, add comments and avoid destructive edits.
10. All public user-facing copy should be Mexican Spanish unless explicitly requested otherwise.

## Database Protection Rules

1. For general UI, website, iOS, Android, and README changes, do not modify `data/`, `scripts/`, or `.github/workflows/`.
2. You may modify `data/`, `scripts/`, or `.github/workflows/` only when the task explicitly states one of the following intents: "更新資料庫", "擴充資料庫", "修復資料庫 workflow", "修改資料來源", or "重新產生 iOS/Android 資料輸出".
3. Database-modification PRs must not also change UI, website, iOS, or Android functionality.
4. App/UI PRs must not also change database-related files.
5. Before and after every change, run `git diff` and verify the change scope matches the task.
6. If you are not sure whether database files can be changed, stop and report instead of editing.
7. All changes must preserve existing production behavior.
8. Website, iOS, and Android must remain compatible.
9. Never break existing GitHub Pages deployment.
10. Never break existing iOS caller ID export.
11. Never break existing Android data read format.
12. JSON output formats must remain backward compatible.

## Safety and Legal Wording

Avoid definitive criminal or legal claims.

Do not use:
- Fraude confirmado
- Estafa confirmada
- Número criminal
- Confirmado legalmente
- Garantizado
- Seguridad absoluta
- Protección total

Prefer:
- Sospechoso
- Posible riesgo
- Reporte comunitario
- Número reportado
- Riesgo potencial
- Información de referencia
- Ayuda a identificar

Always clarify that the service shows community reports and potential risk, not official legal confirmation.

## Avoid Official Misrepresentation

The website must not imply it is:
- a government service
- a telecom official system
- a police database
- a legal certification platform
- an Apple, Meta, or App Store official service

Do not use:
- Oficial
- Gobierno
- Policía
- Certificado
- Verificado oficialmente

If shield, badge, or safety icons are used, keep them as community-tool visuals. Do not make them look like government, banking, legal, or official certification badges.

## Privacy Rules

1. The lookup feature must not require login.
2. The lookup feature must not collect personal data.
3. User reports must not include names, addresses, bank details, emails, or personal information.
4. Notes should be short and sanitized.
5. Never store unnecessary personal data.
6. Do not ask for user identity, documents, address, or financial information.

## Architecture Rules

1. Keep configuration centralized.
2. App Store URL must be stored in one config constant.
3. Do not hardcode App Store URLs in multiple places.
4. Keep data loading compatible with GitHub Pages.
5. Keep JavaScript simple and readable.
6. Avoid adding heavy dependencies.
7. If adding dependencies, explain why.
8. If package scripts are missing, do not invent a complex build system.
9. Do not add social media auto-posting bots inside this repo.
10. Facebook / Instagram scheduling should be handled outside the repo through Meta Business Suite or approved platform tools.

## Platform Policy Safety

Avoid:
- fearmongering wording
- guaranteed safety wording
- “100% protection” claims
- unverified accusations
- collection of sensitive personal information
- language implying official law enforcement judgment

Use:
- Ayuda a identificar
- Riesgo potencial
- Reporte comunitario
- Información de referencia
- Consulta gratuita

## Testing Rules

Before finalizing changes, verify:
- Homepage loads.
- Lookup still works.
- Known reported numbers show possible risk.
- Unknown numbers show unknown result.
- Report form validates input.
- Privacy and notice pages open.
- App Store button opens the configured App Store URL.
- GitHub Pages remains deployable.
