---
name: jira
description: "Use when: building or debugging Jira connector flows in a Power Apps Code App, including jiraInstance-aware helpers, issue or project operations, task operations, or Jira MCP actions."
---

# Jira Connector Guide

> Agent limitation: do not use CLI commands directly from chat for Jira setup. Use the built-in Sync Connections and Deploy buttons instead.

## Core Rule

The wrapper in `dev files/jira.js` is the repo-local source of truth for public helper names and defaults.

- It retries the data-source names `jira`, `Jira`, and `JIRA`.
- It includes inline connector metadata for the operations the wrapper supports.
- Many helpers switch between non-instance and instance-aware variants depending on whether `jiraInstance` is supplied.

## power.config.json

Prefer a Jira connection reference whose `dataSources` array includes `jira`.

```json
{
  "connectionReferences": {
    "jiraConnection": {
      "id": "/providers/Microsoft.PowerApps/apis/shared_jira",
      "displayName": "Jira",
      "dataSources": ["jira"],
      "authenticationType": "APIToken",
      "dataSets": {}
    }
  }
}
```

## Public Helper Surface

`Jira.js` exports stable helpers such as:

- `listJiraIssues(...)`
- `getJiraIssueByKey(...)`
- `addJiraComment(...)`
- `createJiraIssue(...)`
- `createJiraIssueV3(...)`
- `editJiraIssue(...)`
- `updateJiraIssue(...)`
- `listJiraProjects(...)`
- `createJiraProject(...)`
- `updateJiraProject(...)`
- `deleteJiraProject(...)`
- `getJiraTask(...)`
- `cancelJiraTask(...)`
- `getCurrentJiraUser(...)`
- `getJiraUser(...)`
- `listJiraIssueTypes(...)`
- `listJiraStatuses(...)`
- `manageJiraIssues(queryRequest, sessionId)`

## Important Wrapper Behavior

- Passing `jiraInstance` makes the wrapper inject `X-Request-Jirainstance` and choose the instance-aware operation when one exists.
- `cancelJiraTask(...)` sends `X-Atlassian-Token` and defaults it to `nocheck` when no token is provided.
- `listJiraProjects(...)` uses `ListProjects_V2` without an instance and `ListProjects_V3` with an instance.
- `createJiraIssue(...)` chooses between `CreateIssue`, `CreateIssueV2`, and `CreateIssue_V3` based on the provided options.

## Raw Operation Notes

If you need a raw connector call, use `callJiraOperation(operationName, parameters)` and preserve the exact connector field names.

Do not guess:

- operation names
- path shapes
- Jira instance header names
- query field names like `issueTypeIds`, `notifyUsers`, or `overrideEditableFlag`

## Debugging

- If the failure mentions missing `path`, the inline metadata is incomplete or the wrong operation name is being used.
- If the failure mentions Jira instance validation, check whether the helper expects `jiraInstance` and whether the wrapper selected the correct variant.
- Use generated schema or service files only as supporting references; the repo wrapper controls the public API used by apps in this repo.