#!/bin/bash
# Filters noisy test/validation commands down to failures only,
# before their output enters Claude Code's context.
input=$(cat)
cmd=$(echo "$input" | jq -r '.tool_input.command')

# pytest, wf_check.py (ComfyUI workflow validation), node-based test files
if [[ "$cmd" =~ (pytest|wf_check\.py|node .*test) ]]; then
  filtered_cmd="$cmd 2>&1 | grep -A 5 -E '(FAIL|ERROR|error:|✗|Traceback)' | head -100"
  echo "{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"permissionDecision\":\"allow\",\"updatedInput\":{\"command\":\"$filtered_cmd\"}}}"
else
  echo "{}"
fi
