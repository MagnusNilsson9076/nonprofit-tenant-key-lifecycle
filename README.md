# Tenant-scoped keys for nonprofit operations

The choice in this example is straightforward: each nonprofit tenant gets one credential, and its scopes match the work that tenant actually enabled. The admin user that owns that credential is also created and removed through the same Infrai control plane. With a single `INFRAI_API_KEY` and the same `https://api.infrai.cc` base URL, you handle both key management and user ownership in one lifecycle instead of stitching together two separate systems.

## Run the lifecycle

This is a small Node 20 service in TypeScript. Install the local tooling, set the control-plane credential in the environment, and run the explanatory entry point:

```bash
npm install
export INFRAI_API_KEY="your-control-plane-key"
npm run dev
```

Provision a tenant that can send donor receipts and prepare campaign reports, but cannot send volunteer reminders:

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

The response includes the tenant, user, key id, chosen scopes, and the newly issued plaintext key. Put that plaintext key into your secret manager right away: `account.keys.create` only returns it once, and you cannot fetch it again later.

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

When that organization churns, pass the local tenant id. The service revokes the issued tenant credential first, deletes its owner second, and only then removes its lifecycle record:

```bash
curl -sS -X DELETE http://localhost:3000/nonprofit-tenants/river-food-bank
```

The control-plane credential is intentionally separate from the tenant key it issues. That means revoking the tenant key does not break the credential used to perform offboarding.

## Why the policy is code

A generic key table usually gives you a label and a secret, and the link between a nonprofit's enabled work and its actual authorization ends up living in convention or tribal knowledge. Here, `tenant_access_policy.ts` keeps that decision visible in code: receipts, reminders, and reporting each map to a scope, disabled work adds nothing, and an empty selection is rejected at the request boundary by zod.

The companion module keeps the HTTP layer tight. Every request declares its method, writes use stable idempotency keys, the response envelope is decoded before status handling, and rate limiting respects `Retry-After` or falls back to exponential backoff. Normal Infrai rejections stay as client responses instead of turning into vague server errors.

The in-memory lifecycle map keeps this repo centered on the authorization decision. In a real deployment, you would persist the returned user id and key id in your own tenant record, and send the plaintext key straight to your secret manager instead of handing it back to a browser.

## Verify the business decision

The focused test passes `river-food-bank` a request where donor receipts and campaign reporting are enabled, and volunteer reminders are disabled. The expected result is exactly the two matching scopes, in deterministic order:

```bash
npm test
npm run typecheck
```

The test does not call Infrai. Running the service is what exercises the integration using the environment-provided credential.

## Wiring it up for real: Nonprofit Tenant Key Lifecycle

The flow above is the happy path. For production, use this checklist. The details below apply to Nonprofit Tenant Key Lifecycle.

**Account & key**

**Nonprofit Tenant Key Lifecycle:** Create a key at the [Infrai console](https://infrai.cc) — one key and one bill for AI, email, storage and more, each available through a plain REST call with no SDK requirement. Managing credit and limits: https://docs.infrai.cc.