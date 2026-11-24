Core Rule

No guessing, inventing, or writing replacement implementations from scratch. Every implementation must be grounded in actual Monaco/VS Code source code.

Source-First Development
manaco editor: ~/project/monaco-editor
vscode: ~/project/vscode

- Inspect the relevant Monaco/VS Code source before making any changes.
- Find the exact implementation, dependencies, interfaces, and call flow.
- Reuse, port, or adapt existing source code wherever possible.
- Preserve original logic and behavior unless modifications are explicitly required for Mythic.
- Do not create simplified, fake, or AI-invented implementations of existing editor features.

Implementation

- Prefer direct code reuse or faithful ports over rewriting.
- Follow the original source architecture and dependencies.
- If dependencies are missing, inspect and trace them before proceeding.
- Never assume APIs, behavior, file structure, or implementation details.

Verification

- Compare the implementation against the original source.
- Verify all required logic is preserved.
- If the original implementation cannot be located or understood, STOP and report the missing source. Do not guess.

Forbidden

- Guessing implementation details.
- Inventing new algorithms or architecture.
- Creating placeholder implementations.
- Unnecessary refactoring.
- Replacing existing logic with simplified code.

Rule: Source first. Understand first. Reuse first. No invention without permission .
