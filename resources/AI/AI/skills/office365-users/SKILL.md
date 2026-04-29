---
name: office365-users
description: "Use when: building or debugging Office 365 Users connector flows in a Power Apps Code App, including profiles, managers, direct reports, photos, searchForUsers, or openUsersHttpRequest."
---

# Office 365 Users Connector Guide

Do not use CLI PAC commands to get connecctor models or services,
use `codeApp/dist/connectors/office365users.js` as the repo source of truth.


## power.config.json

Always read the current `power.config.json` before editing it.

Ensure `"id": "/providers/Microsoft.PowerApps/apis/shared_office365users"` exists.

```json
"connectionReferences": {
  "office365users": {
      "id": "/providers/Microsoft.PowerApps/apis/shared_office365users",
      "displayName": "Office 365 Users",
      "dataSources": [
        "office365users"
      ],
      "authenticationType": null,
      "sharedConnectionId": null,
      "dataSets": {}
    }
}
```

Rules for editing `power.config.json`:

- Preserve existing keys such as `sharedConnectionId`, `authenticationType`, and other working connection metadata.
- If the app uses Dataverse environment variables, also load the environment-variables skill.

## Core Rule

Prefer the exported helper layer instead of wiring raw connector operations directly in app code.

## Action Helper Surface

- `callUsersOperation(operationName, parameters)`
- `openUsersHttpRequest(options)`
- `updateMyProfile(profile)`
- `getMyProfile(options)`
- `getUserProfile(userId, options)`
- `getManager(userId, options)`
- `getDirectReports(userId, options)`
- `getMyTrendingDocuments(options)`
- `getTrendingDocuments(userId, options)`
- `getRelevantPeople(userId)`
- `updateMyPhoto(bodyOrOptions, contentType)`
- `getUserPhotoMetadata(userId)`
- `getUserPhoto(userId)`
- `searchForUsers(options)`

## Latest Action Defaults

- Profile helpers default to the V2 profile and manager actions.
- `getDirectReports(...)` defaults to `DirectReports_V2`.
- `getUserPhoto(...)` uses `UserPhoto_V2`.
- `searchForUsers(...)` uses `SearchUserV2`.
- `searchForUsers(...)` accepts `nextLink` and `skip` aliases and converts them into `skipToken`.

## HTTP Escape Hatch

`openUsersHttpRequest(...)` maps friendly inputs to connector fields:

- `uri` -> `Uri`
- `method` -> `Method`
- `body` -> `Body`
- `contentType` -> `ContentType`
- `customHeaders[0..4]` -> `CustomHeader1..5`

Use this only when no helper exists for the action you need.

## Debugging

- If search pagination fails, pass `skipToken` or `nextLink`, not `$skip`.
- If HTTP requests fail, verify you are sending connector-style fields through `openUsersHttpRequest(...)`.
- Keep helper names stable and widen alias support instead of introducing another wrapper.