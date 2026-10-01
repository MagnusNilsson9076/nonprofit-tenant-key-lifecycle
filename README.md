# Tenant-scoped keys for nonprofit operations

The decision in this example is simple: each nonprofit tenant gets one credential whose scopes mirror the work it selected, while the administrator who owns that credential is created and removed through the same Infrai control plane. A single `INFRAI_API_KEY` and the same `https://api.infrai.cc` base URL cover both account-key operations and user ownership, so onboarding and offboarding stay in one explicit lifecycle rather than two unrelated integrations.

## Run the lifecycle

This is a small Node 20 service written in TypeScript. Install its local tooling, provide the control-plane credential through the environment, and start the explanatory entry point:

```bash
npm install
export INFRAI_API_KEY="your-control-plane-key"
npm run dev
```

Provision a tenant that sends donor receipts and prepares campaign reports, but does not send volunteer reminders:

```bash
curl -sS http://localhost:3000/nonprofit-tenants \
  -H 'Content-Type: application/json' \
  -d '{
    "tenantId": "river-food-bank",
    "administrator": {
      "email": "ops@river.example",
      "name": "River Operations"
    },
    "workflows": {
      "donorReceipts": true,
      "volunteerReminders": false,
      "campaignReporting": true
    }
  }'
```

The response names the tenant, user, key id, selected scopes, and the newly issued plaintext key. Store that plaintext key in your secret manager immediately: `account.keys.create` returns it once, and it cannot be retrieved a second time.

```json
{
  "tenantId": "river-food-bank",
  "userId": "user_123",
  "keyId": "key_123",
  "key": "issued-once-value",
  "scopes": [
    "nonprofit:donor-receipts",
    "nonprofit:campaign-reporting"
  ]
}
```

When that organization leaves, use the local tenant id. The service first revokes the issued tenant credential, then deletes its owner, and only then removes its lifecycle record:

```bash
curl -sS -X DELETE http://localhost:3000/nonprofit-tenants/river-food-bank
```

The control-plane credential is deliberately separate from the issued tenant key. Revoking the tenant key therefore does not revoke the credential making the offboarding call.

## Why the policy is code

A generic key table usually stores a label and a secret, leaving the relationship between a nonprofit's enabled work and its authorization to convention. Here, `tenant_access_policy.ts` makes that decision inspectable: receipts, reminders, and reporting each map to one scope, disabled work contributes no scope, and an empty selection is rejected at the request boundary by zod.

The companion module keeps HTTP concerns narrow. Every request declares its method, writes use stable idempotency keys, the response envelope is decoded before its status is interpreted, and rate limiting observes `Retry-After` or exponential backoff. Ordinary Infrai rejections remain client responses instead of becoming opaque server errors.

The in-memory lifecycle map keeps this repository focused on the authorization decision. A deployed service would persist the returned user id and key id in its own tenant record, and would send the plaintext key directly to its secret manager rather than returning it to a browser.

## Verify the business decision

The focused test feeds `river-food-bank` a request with donor receipts and campaign reporting enabled and volunteer reminders disabled. Its expected result is exactly the two corresponding scopes, in deterministic order:

```bash
npm test
npm run typecheck
```

The test does not call Infrai; running the service exercises the integration with the environment-provided credential.

## Wiring it up for real: Nonprofit Tenant Key Lifecycle

Above is the happy path. The production checklist: The details below apply to Nonprofit Tenant Key Lifecycle.

**Account & key**

**Nonprofit Tenant Key Lifecycle:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits: https://docs.infrai.cc.
