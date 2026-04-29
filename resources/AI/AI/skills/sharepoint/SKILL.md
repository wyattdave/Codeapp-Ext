---
name: sharepoint
description: "Use when: building or debugging SharePoint list, attachment, library, or file flows in a Power Apps Code App, including list-id or environment-variable-based setup."
---

# SharePoint App Builder Guide

Use this skill when an app needs SharePoint list CRUD, list item attachments, file operations, or library metadata through `./connectors/sharepoint.js`.

Use the working OG-style SharePoint wrapper pattern from this repo as the reference: siteUrl-based connector paths, wrapper-side site URL encoding, `GetTables` lookup for the connector table token, and standard CRUD after resolution.

Do not use CLI setup flows from chat. Use the built-in Auth, Sync Connections, and Deploy buttons.

## First Questions To Ask

Ask only the minimum needed to choose the right setup and write working code:

1. Is this app working with a SharePoint list, list item attachments, or files in a document library?
2. What is the exact SharePoint site URL?
3. Check the agent folder for the list schema, the list id is often part of it.
4. Do you already have the SharePoint list ID, do not accept list or library names as the primary identifier.
5. Should config come from hardcoded app config or Dataverse environment variables?
6. Does the current `power.config.json` already contain `connectionReferences.sharepointonline`?
7. Are there complex SharePoint fields involved such as person, lookup, or multi-value choice columns?

Preferred configuration order:

- A: site URL + list ID
- B: environment variables that resolve site URL + list ID

Do not ask for a list name as the primary CRUD identifier. If the user only knows the list name, use it only as a lookup hint.

Schemas are often stored in the 'agent' folder.

## power.config.json

Always read the current `power.config.json` before editing it.

Ensure `"id": "/providers/Microsoft.PowerApps/apis/shared_sharepointonline"` exists and ` "dataSources": ["sharepointonline"]`.

```json
{
  "connectionReferences": {
    "sharepointonline": {
      "id": "/providers/Microsoft.PowerApps/apis/shared_sharepointonline",
      "displayName": "SharePoint",
      "dataSources": ["sharepointonline"],
      "dataSets": {}
    }
  }
}
```

Rules for editing `power.config.json`:

- Preserve existing keys such as `sharedConnectionId`, `authenticationType`, and other working connection metadata.
- No Dataverse tables are needed for basic SharePoint-only apps.
- If the app uses Dataverse environment variables, also load the environment-variables skill and add the two Dataverse environment-variable tables there.

## Core App Rules

- Prefer dedicated SharePoint helpers over raw HTTP.
- Keep SharePoint list discovery inside `sharepoint.js`, not in app pages or components.
- Do not pre-encode the site URL. Pass the raw URL string and let the wrapper encode it.
- Always resolve through `resolveSharePointList(...)` once at startup so the wrapper can match the connector table token.
- If the app only knows a list name, use `resolveSharePointList(...)` or a by-list helper and let the wrapper do `listTables(...)` lookup.

When generating or fixing a local `dist/connectors/sharepoint.js` wrapper:

- initialize the connector client with `getClient(dataSourcesInfo)`
- keep the working SharePoint action parameter names aligned with the OG contract: `siteUrl`, `table`, `item`, and the standard CRUD/query names
- keep reusable list-resolution helpers in the wrapper
- preserve `callSharePointOperation(...)` as the escape hatch for supported actions
- prefer dedicated attachment and file helpers instead of exposing `HttpRequest`

## Recommended Startup Pattern

For list-backed apps, resolve the list once during startup and keep the returned access object in app state.

```js
import {
  createSpItemByList,
  deleteSpItemByList,
  getItemsByList,
  resolveSharePointList,
  updateSpItemByList,
} from './connectors/sharepoint.js';

const oAppConfig = {
  sSiteUrl: 'https://tenant.sharepoint.com/sites/example',
  sListId: '00000000-0000-0000-0000-000000000000',
  sListName: 'Tasks',
};

const oListAccess = await resolveSharePointList(oAppConfig.sSiteUrl, {
  listId: oAppConfig.sListId,
  listName: oAppConfig.sListName,
});

const aItems = await getItemsByList(oListAccess.sSiteUrl, oListAccess, { top: 200 });
await createSpItemByList(oListAccess.sSiteUrl, oListAccess, { Title: 'New item' });
await updateSpItemByList(oListAccess.sSiteUrl, oListAccess, 1, { Title: 'Updated item' });
await deleteSpItemByList(oListAccess.sSiteUrl, oListAccess, 1);
```

Why this is the preferred pattern:

- it keeps list lookup and fallback logic inside the wrapper
- it works whether the connector resolves a table token or falls back to the configured list ID
- it matches the working SharePoint demo app in this repo

## Function Surface And Correct Usage

Generic helpers:

- `callSharePointOperation(operationName, parameters)`
- `listTables(siteUrl)`
- `listLibrary(siteUrl, libraryId, queryOptions)`
- `resolveSharePointList(siteUrl, listReference)`

Attachment helpers:

- `getItemAttachments(siteUrl, listId, itemId)`
- `getAttachmentContent(siteUrl, listId, itemId, attachmentId)`
- `createAttachment(siteUrl, listId, itemId, displayName, fileContent)`
- `deleteAttachment(siteUrl, listId, itemId, attachmentId)`

By-list attachment helpers:

- `getItemAttachmentsByList(siteUrl, listReference, itemId)`
- `getAttachmentContentByList(siteUrl, listReference, itemId, attachmentId)`
- `createAttachmentByList(siteUrl, listReference, itemId, displayName, fileContent)`
- `deleteAttachmentByList(siteUrl, listReference, itemId, attachmentId)`

List-ID CRUD helpers:

- `getItems(siteUrl, listId, { filter, orderBy, top, skip })`
- `getSpItem(siteUrl, listId, itemId)`
- `createSpItem(siteUrl, listId, fields)`
- `updateSpItem(siteUrl, listId, itemId, changedFields)`
- `deleteSpItem(siteUrl, listId, itemId)`

By-list CRUD helpers:

- `getItemsByList(siteUrl, listReference, queryOptions)`
- `getSpItemByList(siteUrl, listReference, itemId)`
- `createSpItemByList(siteUrl, listReference, fields)`
- `updateSpItemByList(siteUrl, listReference, itemId, changedFields)`
- `deleteSpItemByList(siteUrl, listReference, itemId)`

File helpers:

- `createFile(siteUrl, folderPath, fileName, fileContent, optionsOrContentType)`
- `createRawFile(siteUrl, folderPath, fileName, fileContent)` - coerces non-string content to a string before upload
- `createBinaryFile(siteUrl, folderPath, fileName, base64Content, contentType)`
- `createBase64File(siteUrl, folderPath, fileName, base64Content, contentType)`
- `createByteFile(siteUrl, folderPath, fileName, byteContent, contentType)`
- `createBlobFile(siteUrl, folderPath, fileName, fileContent, contentType)`
- `updateFile(siteUrl, fileId, fileContent, optionsOrContentType)`
- `deleteFile(siteUrl, fileId)`
- `moveFile(siteUrl, sourceFileId, destinationFolderPath, newFileName)`
- `getFileMetadata(siteUrl, fileId)`
- `getFileContent(siteUrl, fileId)`

Attachment helpers:

- `getSpItemAttachments(siteUrl, listId, itemId)` when the list ID or resolved table token is already known and app code needs the current attachment metadata for one item.
- `getSpItemAttachmentContent(siteUrl, listId, itemId, attachmentId)` only when app code must read an existing attachment's bytes by direct list ID access; do not use it as the primary upload-verification path in this runtime.
- `deleteSpItemAttachment(siteUrl, listId, itemId, attachmentId)` when the list ID or resolved table token is already known and app code needs to remove an attachment directly.
- `createSpItemAttachmentByList(siteUrl, listReference, itemId, displayName, fileContent)` when app code should upload an attachment and let the wrapper resolve the list from a list ID, list name, or resolved access object.
- `getSpItemAttachmentsByList(siteUrl, listReference, itemId)` when app code should confirm an attachment exists or render attachment metadata without manually handling list resolution.
- `getSpItemAttachmentContentByList(siteUrl, listReference, itemId, attachmentId)` only when app code must read an existing attachment after resolving through a list reference; prefer metadata checks from `getSpItemAttachmentsByList(...)` for upload verification.
- `deleteSpItemAttachmentByList(siteUrl, listReference, itemId, attachmentId)` when app code should remove an attachment and let the wrapper resolve the list reference first.

Important behavior:

- `resolveSharePointList(...)` returns both generic keys and app-friendly aliases: `siteUrl`, `listId`, `listName`, `sSiteUrl`, `sListId`, `sListName`, plus `table` and lookup metadata.
- `getItemsByList(...)` and the other by-list helpers accept a list name, list ID object, or resolved access object.
- Prefer the `...ByList(...)` attachment helpers in app code unless the wrapper already has the exact connector table token or list ID in hand.
- Create and update payloads must be plain objects.
- Item IDs can be strings or numbers.
- Attachment IDs and attachment display names must be non-empty strings.
- Query options such as `top` and `skip` must be numeric if supplied.
- `listLibrary(...)` requires a document library GUID, not a display name.
- `moveFile(...)` can rename during the move when `newFileName` is supplied.
- `createFile(...)` and `updateFile(...)` accept either a content-type string or an options object with `contentType`.
- `createFile(...)` can upload string, `Blob`, `ArrayBuffer`, or typed-array content.
- `createRawFile(...)` is the string-only helper; use the binary/base64/byte/blob helpers when the app is not uploading plain text.
- `createBinaryFile(...)` and `createBase64File(...)` both take base64 input and decode it before upload.
- Attachment creation uses string content; binary attachment handling should be encoded by the app before calling the helper.

## Response Handling In App Code

SharePoint item reads may come back as an array or inside a nested result shape. Normalize collections in app code before rendering tables or computing counts.

```js
function normalizeCollection(oPayload) {
  if (Array.isArray(oPayload)) {
    return oPayload;
  }

  const aCandidates = [
    oPayload && oPayload.value,
    oPayload && oPayload.items,
    oPayload && oPayload.results,
    oPayload && oPayload.body,
    oPayload && oPayload.data,
    oPayload && oPayload.result,
    oPayload && oPayload.response,
    oPayload && oPayload.d && oPayload.d.results,
  ];

  return aCandidates.find(Array.isArray) || [];
}
```

## Environment Variable Pattern

If the app should not hardcode the site URL or list ID, load the environment-variables skill too.

Rules:
- Ask for the exact existing schema names.
- Read values through `getEnvironmentVariable(...)` from `./codeapp.js`.
- Update `power.config.json` with the Dataverse environment-variable tables only when the app actually uses them.
- If a Data Source environment variable stores JSON, parse it before extracting the site URL or list ID.

## Error Handling
The wrapper already converts many connector failures into readable errors such as `SharePoint GetItems failed: ...`, so app code should display those messages rather than swallowing them.

Keep separate loading and submit flags in UI state so refresh, create, update, and delete actions do not overlap silently.

## Learnings

### listTables limitations
- `listTables(siteUrl)` only returns **custom lists** (Type 100).
- It does **not** return system libraries like Site Pages, Shared Documents, Style Library, Form Templates, etc.
- It is still the best way to **verify a site URL is reachable** — if it returns without error, the site exists and the connector is authenticated.

### Accessing hidden/system lists (Site Pages, Documents)
- Even though `listTables` doesn't return them, `getItems(siteUrl, 'Site Pages', { top: N })` **works** using the list's **display name** as the table identifier.
- The display name must match exactly (case-sensitive, with space): `'Site Pages'`, `'Shared Documents'`, `'Documents'`.
- `resolveSharePointList(siteUrl, { listName: 'SitePages' })` will **fail** because it internally calls `listTables` and tries to match — the list isn't in that result set. Do not use `resolveSharePointList` for system libraries.
- Use `getItems` and `getSpItem` directly with the display name string as the table parameter instead.

### Field names in connector responses
- The SharePoint connector returns fields with different names than the REST API:
  - `ID` (uppercase) not `Id`
  - `ItemInternalId` — string version of the ID
  - `{Link}` — full URL to the item (replaces `FileRef`)
  - `{Name}` — display name without extension
  - `{FilenameWithExtension}` — e.g. `Home.aspx`
  - `{Path}` — folder path e.g. `SitePages/`
  - `{FullPath}` — e.g. `SitePages/Home.aspx`
  - `{Identifier}` — URL-encoded relative path
  - `{IsFolder}` — boolean
  - `{ContentType}` — object with `Id` and `Name`
  - `{VersionNumber}` — e.g. `"18.8"`
  - `{Thumbnail}` — object with Large/Medium/Small
  - `BannerImageUrl` — direct string URL (not an object like REST API returns)
  - `Editor`, `Author` — expanded user objects with `Claims`, `DisplayName`, `Email`, `Picture`, `Department`, `JobTitle`
- **`CanvasContent1` is NOT returned by `getItems`** on the Site Pages list. It must be fetched per-page via `getSpItem(siteUrl, 'Site Pages', itemId)`.

### HttpRequest
- The public SharePoint wrapper in this repo **does** expose `sendHttpRequest(...)` for the site-scoped SharePoint `HttpRequest` action.
- `sendHttpRequest(siteUrl, request)` is the safe default for this repo's existing contract: it passes `siteUrl` separately and supports relative SharePoint REST paths such as `_api/...`.
- The connector schema also includes `OpenHttpRequest`, exposed here as `sendOpenHttpRequest(...)`, which targets the generic `/{connectionId}/httprequest` endpoint instead of the site-scoped `/{connectionId}/datasets/{siteUrl}/httprequest` route.
- Use `HttpRequest` when you are working against a known SharePoint site and want the connector to scope the request by `siteUrl`; use `OpenHttpRequest` only when the connector/runtime supports the generic open HTTP endpoint and you can provide a fully resolved request URI.
- Prefer dedicated list, item, and file helpers when they already cover the scenario; use the HTTP helpers for SharePoint REST operations that are not otherwise wrapped.

### List item attachments
- SharePoint list item attachments are supported through dedicated connector actions: `GetItemAttachments`, `GetAttachmentContent`, `CreateAttachment`, and `DeleteAttachment`.
- Prefer the by-list attachment helpers in app code when the app already resolves list access at startup.
- Use `getItemAttachments(...)` or `getItemAttachmentsByList(...)` first to obtain the attachment metadata and `attachmentId`.
- Use `getAttachmentContent(...)` or `getAttachmentContentByList(...)` to fetch the attachment body.
- Use `createAttachment(...)` or `createAttachmentByList(...)` to add an attachment to a list item.

### createFile behavior
- `createFile(siteUrl, folderPath, fileName, content, optionsOrContentType)` works even for folders/libraries not visible in `listTables`.
- The `folderPath` must be the server-relative path: e.g. `/sites/IntelligentAutomation/PowerPlatform/Shared Documents/md`.
- `createFile(...)` accepts text or binary content and can set the content type.
- `createRawFile(...)` forces string upload behavior for text content like `.md`.
- `createBinaryFile(...)`, `createBase64File(...)`, `createByteFile(...)`, and `createBlobFile(...)` are convenience helpers for non-text uploads.

### Site discovery pattern
- Use `listTables(siteUrl)` purely as a connectivity probe — if it returns without error, the site URL is valid.
- Derive `activeSiteRelative` from the URL pathname: `new URL(siteUrl).pathname`.
- Do not attempt to call `/_api/web` or any REST endpoint through the SharePoint wrapper — there is no supported HTTP helper in this repo.

### Recommended discovery approach for Code Apps
```js
// 1. Probe site reachability
await listTables(siteUrl); // throws if site is unreachable

// 2. Try getItems with known list display names directly
const pages = await getItems(siteUrl, 'Site Pages', { top: 1 });
// If this works, 'Site Pages' is the table token

// 3. For per-item detail (e.g. CanvasContent1)
const page = await getSpItem(siteUrl, 'Site Pages', itemId);

// 4. For file operations
await createFile(siteUrl, serverRelativeFolderPath, fileName, content);
```

## Debugging Checklist

- If the failure happens before any connector call, verify `initSharePointClient()` returns `getClient(dataSourcesInfo)` and the wrapper was not replaced with a stub.
- If SharePoint calls suddenly return 404 after switching wrapper style, fall back to the OG siteUrl-based contract instead of a generated dataset or OData-style surface.
- If attachment listing fails, confirm the item belongs to the same list and site you resolved earlier.
- If attachment content fails, confirm you are using the `attachmentId` returned by `getItemAttachments(...)`, not the display name.
- If you see `Provide a SharePoint listId or listName.`, the app never supplied startup list configuration.
- If you see `SharePoint item payload must be an object.`, the app passed a string, `FormData`, or another invalid payload.
- If you see `SharePoint site URL is required.`, the config source is empty or malformed.
- If list resolution fails, confirm the site URL and list ID belong to the same site.
- If the user only knows a list name, let the wrapper perform `listTables(...)` lookup instead of building lookup logic in the page.
- Do not manually call `encodeURIComponent(siteUrl)` before passing the site URL to the wrapper.
- If file upload content is not plain text, use the binary/base64/byte/blob helpers or pass a content type through `createFile(...)` or `updateFile(...)`.
- Use `enableDebugger()` during app development so `_dbgWrap(...)` traces are available.
- Do not reintroduce `sendHttpRequest(...)` into the SharePoint wrapper.

## Summary Rules

- Ask for site URL and list ID first.
- Treat list name as a fallback lookup hint, not the primary identifier.
- Update `power.config.json` by merging in `connectionReferences.sharepointonline`, not by overwriting working connection metadata.
- Resolve the list once at startup and keep the resolved access object in app state.
- Prefer by-list helpers in app code and keep list lookup inside `sharepoint.js`.
- Show connector error messages directly in the UI.