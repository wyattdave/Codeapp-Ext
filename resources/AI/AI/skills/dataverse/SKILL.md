---
name: dataverse
description: "Use when: building or debugging Dataverse CRUD in a Power Apps Code App, registering tables with initDataSources or registerTable, calling callUnboundAction, or using whoAmI and Dataverse-backed environment variables."
---

# Dataverse Guide

> Prerequisite: load the `connections` skill for the shared auth and wrapper rules.

## power.config.json

For the helper in `dev files/codeapp.js`, Dataverse CRUD depends on `databaseReferences.default.cds.dataSources`.

```json
{
  "databaseReferences": {
    "default.cds": {
      "dataSources": {
        "accounts": {
          "entitySetName": "accounts",
          "logicalName": "account",
          "isHidden": false
        }
      }
    }
  }
}
```

- `entitySetName` is the plural OData collection name.
- `logicalName` is the singular logical name.
- Every Dataverse table used by the app must be present here.
- Schemas are often stored in the `agent` folder, if they are not check `.power\schemas` folder. If required and missing use `pac code add-data-source -a dataverse -t <tableName>` to generate the schema in  `.power\schemas` folder.
- if schema found copy it to `agent` folder and edit the `.power/schemas/` folder.
- Do not add unbound actions like `WhoAmI` or `GrantAccess` to `dataSources`.

The helper does not require a separate Dataverse `connectionReferences` entry for CRUD or `callUnboundAction`.

## Table Registration

The helper supports both `initDataSources(...)` and `registerTable(...)`.

Use `initDataSources(...)` before the first Dataverse call when you know the full table set up front.

```js
import { initDataSources } from './codeapp.js';

function dsEntry(sPrimaryKey) {
  return { tableId: '', version: '', primaryKey: sPrimaryKey, dataSourceType: 'Dataverse', apis: {} };
}

initDataSources({
  accounts: dsEntry('accountid'),
  contacts: dsEntry('contactid')
});
```

Use `registerTable(tableName, primaryKey)` only when you need to add a table at runtime. It resets the cached client.

## CRUD Surface

`codeapp.js` exports:

- `createItem(tableName, primaryKey, record)`
- `getItem(tableName, primaryKey, id, select)`
- `listItems(tableName, primaryKey, options)`
- `updateItem(tableName, primaryKey, id, changedFields)`
- `deleteItem(tableName, primaryKey, id)`

Notes:

- `listItems(...)` returns `{ entities: [...] }`.
- `select` and `orderBy` accept arrays or comma-separated strings.
- `whoAmI()` reads the Power Apps context with `getContext()`; it does not call a Dataverse action.

## Unbound Actions

`callUnboundAction(tableName, primaryKey, actionName, params)` uses `callActionAsync(...)` under the hood.

- It requires at least one real Dataverse table to be registered so the helper can resolve the environment.
- Do not add action names to `power.config.json`.
- Standard Dataverse actions still need correct complex parameter payloads such as `@odata.type` annotations.

## Environment Variables

`getEnvironmentVariable(schemaName)` is part of the same helper file.

- Add `environmentvariabledefinitions` and `environmentvariablevalues` to `databaseReferences.default.cds.dataSources`.
- Include those tables in `initDataSources(...)` or register them before the first read.

## Relationship Tips

- Write lookups with `'<navProperty>@odata.bind': '/<entitySet>(<guid>)'`.
- Read lookup IDs with the `_<name>_value` pattern.

## Common Failures

- `DataSourceNotFound`: the table is missing from `power.config.json`, `initDataSources(...)`, or runtime registration.
- `Invalid property 'xyz'`: the column name is wrong.
- `Entity 'xyz' does not exist`: the entity set name is wrong.
- Single-record retrieve can fail for some tables such as `entities`; use `listItems(...)` with a filter instead.