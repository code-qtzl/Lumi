#!/usr/bin/env python3
"""PreToolUse guard for Bash commands.

Blocks (exit 2) commands that bypass gates or destroy the working tree:
  - git push --force / -f (force-with-lease included)
  - --no-verify on any git command
  - rm -rf of the repo root, HOME, or filesystem root

Everything else passes through (exit 0).
"""
import json
import re
import sys

try:
    payload = json.load(sys.stdin)
except (json.JSONDecodeError, ValueError):
    sys.exit(0)  # not for us; don't block

command = payload.get("tool_input", {}).get("command", "") or ""

RULES = [
    (r"\bgit\b[^|;&]*\bpush\b[^|;&]*(\s--force\b|\s-f\b|\s--force-with-lease\b)",
     "Force-push is blocked (see AGENTS.md: no force-push). Ask a human."),
    (r"\bgit\b[^|;&]*\s--no-verify\b",
     "--no-verify is blocked (see AGENTS.md: never bypass hooks). Fix the cause instead."),
    (r"\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r)\s+(/|~|\$HOME|\.)(\s|$)",
     "rm -rf of the working tree / home / root is blocked."),
]

for pattern, message in RULES:
    if re.search(pattern, command):
        print(message, file=sys.stderr)
        sys.exit(2)

sys.exit(0)
