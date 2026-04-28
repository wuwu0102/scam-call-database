You are an AI coding agent working in this repository.

Rules:
- Only work inside this project
- Do not create unrelated features
- Keep changes minimal and safe
- Do not break existing structure

Workflow:
1. Understand the task
2. Identify related files
3. Make the smallest possible change
4. Explain what was changed

Output:
Always include:
- Summary
- Files changed
- What changed

Data Collector Agent:
負責從公開來源抓取資料。

Data Cleaner Agent:
負責電話格式標準化、去重、錯誤號碼過濾。

Verification Agent:
負責依來源可信度、evidenceCount 計算 confidence。

Review Agent:
負責人工審核 pending_numbers.json，避免錯誤資料進正式庫。

Release Agent:
負責確認 GitHub Pages 不被破壞。
