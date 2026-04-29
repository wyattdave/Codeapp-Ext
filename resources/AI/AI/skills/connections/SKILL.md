---
name: connections
description: "Use when: wiring connector-backed Power Apps Code Apps, validating connectionReferences or dataSources names, or debugging handwritten connector wrappers. Load alongside connector-specific skills."
---

# Connections Guide

Use this skill for the shared rules that apply across the handwritten connector helpers in `dev files/connectors/`.

## Core Rules

All authentication is handled by the Power Apps runtime and the connector client.

Do:
- Keep connector calls inside the wrapper helper for that connector.
- Reuse the repo's helper patterns such as `unwrapResult` and the candidate data-source retry logic in `codeapp.js`.
- Treat the helper file as the repo-local source of truth for public function names, default versions, and parameter mapping.
- Validate `power.config.json` `dataSources` names against the wrapper before changing them.

Don't:
- Don't add MSAL, custom token acquisition, or manual `Authorization` headers.
- Don't call Dataverse or Microsoft Graph directly when the repo already exposes a connector helper.
- Don't invent connector operation paths, header names, or parameter names.
- Don't assume every connector uses the same raw HTTP helper shape.

## Wrapper Patterns

- `codeapp.js` exposes `execConnectorOpWithCandidates(...)` for wrappers that must retry multiple `dataSources` names.
- Some wrappers use exact inline `apis` metadata (`outlook.js`, `office365users.js`, `Teams.js`, `Jira.js`, `AzureKeyvault.js`).
- Some wrappers intentionally rely on runtime-resolved connector operations and focus on stable public helper names (`office365groups.js`).
- Prefer the existing wrapper over rebuilding a connector client from scratch unless the wrapper is missing the operation entirely.

## Raw HTTP Helpers

The raw HTTP helper signatures are not interchangeable.

- Office 365 Outlook, Office 365 Users, and Office 365 Groups map friendly inputs to connector fields like `Uri`, `Method`, `Body`, `ContentType`, and `CustomHeader1..5`.
- SharePoint and Teams currently pass `method`, `uri`, `headers`, and `body` directly.

Check the specific wrapper before copying a raw-request pattern between connectors.

## Review Checklist

- Keep `tableName` aligned with the wrapper's supported `dataSources` names.
- Preserve existing public helper names and widen inputs with options objects instead of breaking positional calls.
- Normalize SDK envelopes before returning data to app code.
- Prefer repo helpers over direct network code when a connector wrapper already exists.