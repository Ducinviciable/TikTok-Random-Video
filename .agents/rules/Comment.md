---
trigger: always_on
---

## Comment Rules — Minimal & Intentional Comments

> Do NOT add comments unless they provide information that cannot be understood from the code itself.

### Rules

1. **No unnecessary comments**
   - Do NOT comment obvious code, variable names, function names, or straightforward logic.
   - Do NOT add comments just to explain what the code literally does.
   - Prefer self-explanatory names and clean code instead of comments.

2. **No verbose JSDoc**
   - Do NOT automatically generate JSDoc for functions, parameters, return values, or message handlers.
   - Do NOT add JSDoc such as:
     ```js
     /**
      * Called by background.js message router for action "refreshCdnUrl".
      * @param ...
      * @returns ...
      */
     ```
   - Only use JSDoc when it is explicitly required by the project, public API documentation, or tooling.

3. **No decorative comments**
   - Do NOT add separator comments such as:
     ```js
     // ─────────────────────────────
     // Example 1
     // =============================
     // ===== Configuration =====
     ```
   - Do NOT use comments as visual section headers unless they are required for a large, genuinely complex file.

4. **No numbered explanatory comments**
   - Do NOT insert comments such as:
     ```js
     // 1. Get user
     // 2. Validate user
     // 3. Update database
     ```
   - Code structure should communicate the execution flow.

5. **Comments must explain WHY, not WHAT**
   - Good:
     ```js
     // Keep this delay to avoid triggering TikTok's rapid-navigation protection.
     ```
   - Bad:
     ```js
     // Wait for 2 seconds.
     await delay(2000);
     ```

6. **Do NOT add comments during refactoring unless necessary**
   - When modifying existing code, preserve existing useful comments.
   - Remove outdated or redundant comments when the related code changes.
   - Do NOT generate new comments merely because code was modified.

7. **Prefer code over comments**
   - If a comment is needed only because the code is difficult to understand, first consider improving:
     - variable names
     - function names
     - function size
     - code structure
     - type definitions
   - Add a comment only if the intent still cannot be expressed clearly through code.

8. **Keep comments short**
   - When a comment is necessary, use a concise single-line comment whenever possible.
   - Avoid multi-line explanations unless the behavior is genuinely complex or externally constrained.

### Default Behavior

**When in doubt, do not write a comment.**

The Agent should produce clean code with minimal comments and must NOT generate:
- verbose JSDoc
- obvious inline comments
- numbered commen