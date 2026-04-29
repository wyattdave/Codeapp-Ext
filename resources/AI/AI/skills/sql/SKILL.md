---
name: sql
description: "Use when: building or debugging SQL Server connector flows in a Power Apps Code App, including table discovery, row CRUD, native queries, or stored procedure execution."
---

# SQL Server Connector Guide

> Agent limitation: do not use CLI commands directly from chat for SQL connector setup. Use the built-in Sync Connections and Deploy buttons instead.

## Core Rule

The wrapper in `codeApp/dist/connectors/sql.js` is the repo-local source of truth.

- It retries the data-source names `sql`, `Sql`, and `SQL`.
- It includes inline metadata for the SQL actions it exposes.
- The Power Apps runtime special-cases `shared_sql`, so do not guess or hand-roll SQL connector paths.

## power.config.json

Prefer a connection reference whose `dataSources` array contains `sql`.

```json
{
  "connectionReferences": {
    "sqlConnection": {
      "id": "/providers/Microsoft.PowerApps/apis/shared_sql",
      "displayName": "SQL Server",
      "dataSources": ["sql"],
      "dataSets": {}
    }
  }
}
```

The connection-reference object key can still vary by environment, but the exposed data-source name should stay aligned with the wrapper.

## Public Helper Surface

The wrapper exports:

- `callSqlOperation(operationName, parameters)`
- `getSqlTables({ server, database })`
- `getSqlRows({ server, database, table, apply, filter, orderBy, skip, top, select })`
- `getSqlRow({ server, database, table, id })`
- `insertSqlRow({ server, database, table, item })`
- `updateSqlRow({ server, database, table, id, item })`
- `deleteSqlRow({ server, database, table, id })`
- `executeSqlQuery({ server, database, query })`
- `executeSqlStoredProcedure({ server, database, procedure, parameters })`

## Supported Connector Actions

The wrapper currently maps to these SQL connector actions:

- `GetTables_V2`
- `GetItems_V2`
- `GetItem_V2`
- `PostItem_V2`
- `PatchItem_V2`
- `DeleteItem_V2`
- `ExecutePassThroughNativeQuery_V2`
- `ExecuteProcedure_V2`

## Important Wrapper Behavior

- `server` and `database` default to `default` when not supplied.
- `getSqlRows(...)` maps the query options to OData-style connector fields such as `$apply`, `$filter`, `$orderby`, `$skip`, `$top`, and `$select`.
- Row CRUD helpers expect the SQL connector `table` value plus either `id` or `item`, depending on the operation.
- `executeSqlStoredProcedure(...)` normalizes `parameters` to `{}` when none are supplied.

## Raw Calls

Use `callSqlOperation(operationName, parameters)` only when a dedicated helper does not already exist.

Do not invent:

- SQL action names
- parameter field names
- runtime URL shapes for `shared_sql`

## Debugging

- If the failure mentions a missing connection reference, confirm the app exposes `sql` in `power.config.json`.
- If the request reaches the connector but returns a path or dataset error, double-check that the code is using the wrapper helpers instead of handwritten SQL action paths.
- If table reads work but stored procedures do not, verify the wrapper is being passed `procedure` and `parameters` rather than a raw request body shape.