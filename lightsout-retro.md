---
description: "Review the last lights-out pipeline run. Analyzes each phase's quality and suggests optimizations."
---

Find the most recent lightsout workflow journal in this project:

1. Look in `~/.claude/projects/` for directories matching the current working directory
2. Find the newest `journal.jsonl` under `subagents/workflows/`
3. Extract the journal directory path and the project directory (CWD)

Then launch the retrospective workflow:
```
Workflow({
  scriptPath: "~/.claude/lights-out/retrospective-workflow.js",
  args: {
    journal_dir: "<path to the directory containing journal.jsonl>",
    project_dir: "<current working directory>"
  }
})
```

If you cannot find a journal, tell the user: "No recent pipeline run found in this project. Run /lightsout first."
