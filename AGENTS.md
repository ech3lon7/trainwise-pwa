# Agent Instructions

This project uses OpenCode skills.

Before making any code changes, check whether a skill applies.

If a skill applies, load it with the OpenCode skill tool and follow the skill exactly.

## Skill Mapping

- Bug, failure, broken behavior, console error, loading issue, or unexpected behavior:
  use `debugging-and-error-recovery`.

- Planning a change:
  use `planning-and-task-breakdown`.

- Implementing a feature or fix:
  use `incremental-implementation`.

- Adding or changing tests:
  use `test-driven-development`.

- Reviewing code:
  use `code-review-and-quality`.

- Simplifying or refactoring code:
  use `code-simplification`.

- UI, layout, styling, components, frontend behavior:
  use `frontend-ui-engineering`.

## Rules

Do not jump straight into implementation when a skill applies.

For bug fixes:
1. Reproduce or inspect the issue.
2. Identify the likely file and function.
3. Explain the intended change.
4. Make the smallest safe edit.
5. Explain how to test it.

For feature work:
1. Define the expected behavior.
2. Plan the smallest implementation path.
3. Edit only the needed files.
4. Test or explain exact manual verification steps.

Preserve the existing style, layout, naming, and module structure.
Do not refactor unrelated code.
Do not rewrite full files unless required.
