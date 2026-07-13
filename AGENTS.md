# Agent Conventions & Lessons Learned

This file records cross-cutting patterns, conventions, and lessons that apply across multiple agents. It is read by the orchestrator and referenced by subagents.

## How This File Works

- If a problem is traced to **instructions in an agent `.md` file**, fix the `.md` file directly — do NOT add a note here.
- If a problem is traced to **instructions given in the orchestrator's prompt to a subagent** (not in any `.md` file), add a note here describing what went wrong and what to tell the orchestrator to do differently.
- If a pattern applies across all agents (e.g., "always handle circular references in serialization"), add it here.

## Cross-Cutting Patterns

*(None yet — add entries as lessons are discovered.)*

## Prompt-Level Lessons

*(None yet — add entries when the orchestrator's prompt to a subagent causes a bug.)*
