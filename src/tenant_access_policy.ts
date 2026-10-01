import { z } from "zod";

export const tenantRequestSchema = z.object({
  tenantId: z.string().min(2).max(80).regex(/^[a-z0-9-]+$/),
  administrator: z.object({
    email: z.string().email(),
    name: z.string().min(1).max(120),
  }),
  workflows: z.object({
    donorReceipts: z.boolean(),
    volunteerReminders: z.boolean(),
    campaignReporting: z.boolean(),
  }).refine((value) => Object.values(value).some(Boolean), {
    message: "Select at least one nonprofit workflow",
  }),
});

export type TenantRequest = z.infer<typeof tenantRequestSchema>;

const workflowScopes = {
  donorReceipts: "nonprofit:donor-receipts",
  volunteerReminders: "nonprofit:volunteer-reminders",
  campaignReporting: "nonprofit:campaign-reporting",
} as const;

export function scopesFor(request: TenantRequest): string[] {
  return Object.entries(request.workflows)
    .filter(([, enabled]) => enabled)
    .map(([workflow]) => workflowScopes[workflow as keyof typeof workflowScopes]);
}
