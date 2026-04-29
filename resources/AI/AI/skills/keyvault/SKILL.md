---
name: keyvault
description: "Use when: building or debugging Azure Key Vault connector flows in a Power Apps Code App, including keys, secrets, metadata, or encryptData and decryptData helpers."
---

# Azure Key Vault Connector Guide

> Agent limitation: do not use CLI commands directly from chat for Key Vault connector setup. Use the built-in Auth, Sync Connections, and Deploy buttons instead.

## Core Rule

The wrapper in `codeApp/dist/connectors/azureKeyvault.js` is the repo-local source of truth for public helper names, supported operations, and parameter normalization.

- It retries the data-source names `keyvault`, `KeyVault`, `azurekeyvault`, `azureKeyVault`, and `AzureKeyVault`.
- It includes inline metadata for the key, secret, metadata, and encrypt/decrypt actions it supports.
- Vault selection is handled by the Power Apps connector connection, not by passing a vault name into each helper call.

## First Questions To Ask

Ask only what is needed to choose the right helper and confirm the right connection:

1. Does the app need keys, secrets, or both?
2. Does it need metadata only, the secret value itself, or encryption/decryption operations?
3. Is a specific key version or secret version required?
4. Does `power.config.json` already contain a Key Vault connection reference?
5. Is the existing Key Vault connection already pointing at the correct vault?

## power.config.json

Prefer a Key Vault connection reference whose `dataSources` array contains `keyvault`.

```json
{
  "connectionReferences": {
    "keyvaultConnection": {
      "id": "/providers/Microsoft.PowerApps/apis/shared_keyvault",
      "displayName": "Azure Key Vault",
      "dataSources": ["keyvault"],
      "dataSets": {}
    }
  }
}
```

Rules for editing `power.config.json`:

- Preserve existing keys such as `sharedConnectionId`, `authenticationType`, and working connection metadata.
- Prefer `keyvault` as the exposed data-source name even though the wrapper retries additional casing variants.
- The connection-reference object key can vary by environment, but the wrapper-facing data source should stay aligned.
- No Dataverse tables are required for Key Vault-only apps.
- Do not invent custom top-level config keys for vault auth or tokens.

## Public Helper Surface

The wrapper exports:

- `callKeyVaultOperation(operationName, parameters)`
- `listKeys(oOptions)`
- `listKeyVersions(keyName)`
- `getKeyMetadata(keyName)`
- `getKeyVersionMetadata(keyName, keyVersion)`
- `encryptData(keyName, inputOrOptions)`
- `encryptDataWithVersion(keyName, keyVersion, inputOrOptions)`
- `decryptData(keyName, inputOrOptions)`
- `decryptDataWithVersion(keyName, keyVersion, inputOrOptions)`
- `getSecret(secretName)`
- `listSecrets(oOptions)`
- `listSecretVersions(secretName)`
- `getSecretMetadata(secretName)`
- `getSecretVersionMetadata(secretName, secretVersion)`
- `getSecretVersion(secretName, secretVersion)`

## Supported Connector Actions

The wrapper currently maps to these connector actions:

- `ListKeys`
- `ListKeyVersions`
- `GetKeyMetadata`
- `GetKeyVersionMetadata`
- `EncryptData`
- `EncryptDataWithVersion`
- `DecryptData`
- `DecryptDataWithVersion`
- `GetSecret`
- `ListSecrets`
- `ListSecretVersions`
- `GetSecretMetadata`
- `GetSecretVersionMetadata`
- `GetSecretVersion`

## Important Wrapper Behavior

- `encryptData(...)` and `decryptData(...)` automatically switch to the versioned connector action when `keyVersion` is supplied in the options object.
- Encryption and decryption helpers accept either positional arguments or an options object.
- `operationInput` is normalized from shapes like `operationInput`, `input`, or `body`.
- For encryption, the wrapper looks for payload values such as `rawData`, `data`, `raw`, `plainText`, `plaintext`, or `value`.
- For decryption, the wrapper looks for payload values such as `encryptedData`, `cipherText`, `ciphertext`, `data`, or `value`.
- The default algorithm is `RSA-OAEP-256` when none is supplied.
- Key and secret helpers accept object forms such as `{ keyName, version }` or `{ secretName, secretVersion }`.
- The wrapper accepts `apiVersion`-shaped arguments on some secret helpers for compatibility, but the current implementation does not pass `apiVersion` through to the connector call.

## Usage Rules

- Use `listKeys(...)` and `listSecrets(...)` for discovery.
- Use metadata helpers when the app only needs properties, status, or version information.
- Use `getSecret(...)` or `getSecretVersion(...)` only when the app actually needs the secret value.
- Prefer `encryptData(...)` and `decryptData(...)` over raw calls when the wrapper already supports the operation.
- If the app requires an exact key version, pass `keyVersion` explicitly or call the version-specific helper.
- Do not add manual auth headers or direct Key Vault REST calls when the connector helper already exists.

## Raw Calls

Use `callKeyVaultOperation(operationName, parameters)` only when a dedicated helper does not already exist.

Do not invent:

- connector action names
- `operationInput` field names
- raw Key Vault REST paths
- manual `api-version` query handling in app code
- manual auth headers or token acquisition

## Debugging

- If the failure mentions a missing connection reference, confirm `power.config.json` exposes a Key Vault connection and prefer `dataSources: ["keyvault"]`.
- If the app hits the wrong vault, the underlying Power Apps connection is likely pointing at a different vault. The wrapper does not choose vaults per request.
- If encryption or decryption fails with input-shape errors, verify the payload resolves to `operationInput` with `rawData` or `encryptedData` after normalization.
- If a version-specific operation is expected but the unversioned action runs, confirm `keyVersion` was actually supplied.
- If changing `apiVersion` appears to do nothing, that is expected with the current wrapper because it does not send `apiVersion` through to the connector.
- If a raw call fails but a dedicated helper exists, switch back to the helper before debugging deeper connector behavior.

## Summary Rules

- Treat `codeApp/dist/connectors/azureKeyvault.js` as the public API contract.
- Prefer `keyvault` as the configured data-source name.
- Use dedicated helpers for keys, secrets, and crypto before raw operations.
- Remember that vault selection lives in the connector connection, not in helper parameters.
- Do not rely on `apiVersion` arguments to change connector behavior unless the wrapper is updated.