import assert from "node:assert/strict";
import test from "node:test";
import { scopesFor, tenantRequestSchema } from "../src/tenant_access_policy.js";

test("a receipts-and-reporting tenant receives only those two scopes", () => {
  const tenant = tenantRequestSchema.parse({
    tenantId: "river-food-bank",
    administrator: { email: "ops@river.example", name: "River Operations" },
    workflows: {
      donorReceipts: true,
      volunteerReminders: false,
      campaignReporting: true,
    },
  });

  assert.deepEqual(scopesFor(tenant), [
    "nonprofit:donor-receipts",
    "nonprofit:campaign-reporting",
  ]);
});
