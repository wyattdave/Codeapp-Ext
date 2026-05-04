---
name: logicflows
description: "Use when: adding or calling Power Automate cloud flows from a Power Apps Code App, including callFlow(...), generated flow services, or shared_logicflows connectionReferences."
---

# Logic Flows Guide

Use this skill when an app needs to trigger a Power Automate cloud flow from a Power Apps Code App.

Prefer the generated flow service when the app already has files under `src/generated/services/`. Use `callFlow(...)` from `codeApp/dist/codeapp.js` when you want a handwritten helper with the same runtime behavior and debugger support.

Use the repo example in `flow files/` as the local source of truth for shape and naming.

## First Questions To Ask

Ask only the minimum needed to wire the flow correctly:

1. Is the flow already solution-aware and using the Power Apps trigger?
2. What is the flow data source name from `power.config.json` `connectionReferences.<key>.dataSources[0]`?
3. Does the flow trigger define any input properties, or should it be called with no input?
4. Does `workflowDetails.dependencies` reference other connectors that also need working `connectionReferences` entries?
5. Is the user editing an existing flow entry or adding a new one copied from `npx power-apps add-flow --flow-id <flow-id>` output?

Do not ask for the flow display name as the primary runtime identifier. App code should call the flow by the generated data source name.

## power.config.json

Always read the current `power.config.json` before editing it.

Every flow entry must use `shared_logicflows` and include a `dataSources` array. The app code uses the first `dataSources` value, not the top-level UUID key.

```json
{
  "connectionReferences": {
    "fa0aab99-8647-43da-880b-a559e761e6dc": {
      "id": "/providers/Microsoft.PowerApps/apis/shared_logicflows",
      "displayName": "Logic flows",
      "dataSources": [
        "childflowa"
      ],
      "workflowDetails": {
        "workflowEntityId": "8e706c9b-4c06-f011-bae1-000d3a9886ab",
        "workflowDisplayName": "ChildFlow A",
        "workflowName": "fa3b3af2-ccfb-2c3e-3ca1-0c3b3ebee675"
      }
    }
  }
}
```

When the flow depends on other connectors, preserve `workflowDetails.dependencies` and the referenced connection entries:

```json
{
  "connectionReferences": {
    "b978fa1f-94cb-4f95-8fb2-89fb7c7bfc3f": {
      "id": "/providers/microsoft.powerapps/apis/shared_office365groups",
      "displayName": "Office 365 Groups"
    },
    "824c5ef2-2c9d-4483-99ea-d09809bf03b8": {
      "id": "/providers/Microsoft.PowerApps/apis/shared_logicflows",
      "displayName": "Logic flows",
      "dataSources": [
        "powerappv2__respondtoapowerapporflow"
      ],
      "workflowDetails": {
        "workflowEntityId": "58539744-2e38-ee11-bdf4-000d3a5a7615",
        "workflowDisplayName": "PowerAppV2 -> Respond to a PowerApp or flow",
        "workflowName": "2d0efe25-ef79-4d37-afb9-d6f27cdeae81",
        "dependencies": {
          "shared_office365groups": "b978fa1f-94cb-4f95-8fb2-89fb7c7bfc3f"
        }
      }
    }
  }
}
```

Rules for editing `power.config.json`:

- Preserve existing keys such as `sharedConnectionId`, `authenticationType`, `dataSets`, and any working dependency mappings.
- Do not replace the top-level flow key with the data source name. The top-level key is a connection reference identifier.
- Do not call the flow with `workflowDisplayName` or the UUID key. Use the `dataSources[0]` value in app code.
- If the flow changes shape, re-run `npx power-apps add-flow --flow-id <flow-id>` when possible so the connection metadata and generated files stay aligned.

## Runtime Usage

Handwritten helper usage:

```js
import { callFlow, enableDebugger } from './codeapp.js';

enableDebugger();

await callFlow('childflowa');

const oResponse = await callFlow('powerappv2__respondtoapowerapporflow', {
  text: 'hello',
  number: 42,
});

console.log(oResponse);
```

You can also pass a target object when you want to keep aliases together:

```js
await callFlow({
  dataSourceName: 'childflowa',
  dataSourceCandidates: ['childflowa', 'ChildFlowA'],
});
```

Generated-service usage remains valid and is preferred when typed files exist:

```ts
import { ChildFlowAService } from './src/generated/services/ChildFlowAService';

const result = await ChildFlowAService.Run({
  text: 'hello',
  number: 42,
});

if (result.success) {
  console.log(result.data);
}
```

No-input flows should be called with no second argument:

```js
await callFlow('childflowa');
```

Input flows should pass the trigger payload as the second argument:

```js
await callFlow('childflowa', {
  text: 'hello',
  number: 42,
});
```

## Debugging

- `callFlow(...)` is wrapped by the built-in `enableDebugger()` panel in `codeapp.js`.
- The debugger shows the flow target, input payload, result payload, error text, and duration.
- If a call fails with `Connection reference not found`, check the flow `dataSources[0]` value and the referenced dependency connections in `power.config.json`.

## Troubleshooting

- If the flow is missing from `power.config.json`, add it with `npx power-apps add-flow --flow-id <flow-id>` when available instead of inventing metadata by hand.
- If the helper cannot find the flow, verify you are using the generated data source name such as `childflowa`, not `ChildFlow A`.
- If the flow has no inputs, do not pass a dummy object unless the flow schema explicitly expects one.
- If the flow has inputs, match the payload shape from the generated model file under `src/generated/models/`.
- If runtime invocation succeeds but response fields are missing, re-run `add-flow` so the local schema matches the current flow definition.