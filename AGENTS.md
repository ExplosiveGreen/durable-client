# Agent Conventions & Lessons Learned

This file records cross-cutting patterns, conventions, and lessons that apply across multiple agents. It is read by the orchestrator and referenced by subagents.

## How This File Works

- If a problem is traced to **instructions in an agent `.md` file**, fix the `.md` file directly **AND** add a note here under "Cross-Cutting Patterns" so future agents learn from it.
- If a problem is traced to **instructions given in the orchestrator's prompt to a subagent** (not in any `.md` file), add a note here under "Prompt-Level Lessons" describing what went wrong and what to tell the orchestrator to do differently.
- If a pattern applies across all agents (e.g., "always handle circular references in serialization"), add it under "Cross-Cutting Patterns".
- Both sections serve the same purpose: prevent the same mistake from happening again. The split just distinguishes whether the fix lives in an agent `.md` file or in the orchestrator's prompt logic.

## Cross-Cutting Patterns

*(None yet — add entries as lessons are discovered.)*

## Prompt-Level Lessons

*(None yet — add entries when the orchestrator's prompt to a subagent causes a bug.)*
