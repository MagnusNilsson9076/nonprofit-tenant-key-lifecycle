import { createServer, type ServerResponse } from "node:http";
import { z } from "zod";
import { InfraiControlPlane, InfraiError } from "./infrai_control_plane.js";
import { scopesFor, tenantRequestSchema, type TenantRequest } from "./tenant_access_policy.js";

const createdUserSchema = z.object({ id: z.string() }).passthrough();
const createdKeySchema = z.object({ id: z.string(), key: z.string() }).passthrough();
const tenantRecords = new Map<string, { userId: string; keyId: string }>();

export async function provisionTenant(client: InfraiControlPlane, request: TenantRequest) {
  const user = createdUserSchema.parse(await client.call<unknown>({
    method: "POST",
    path: "/v1/auth/user/create",
    body: {
      email: request.administrator.email,
      name: request.administrator.name,
      metadata: { nonprofit_tenant_id: request.tenantId },
      mode: "tenant",
      idempotency_key: `nonprofit-user-${request.tenantId}`,
    },
  }));

  const credential = createdKeySchema.parse(await client.call<unknown>({
    method: "POST",
    path: "/v1/account/keys/create",
    body: {
      name: `${request.tenantId} nonprofit workflows`,
      scopes: scopesFor(request),
      idempotency_key: `nonprofit-key-${request.tenantId}`,
    },
  }));

  tenantRecords.set(request.tenantId, { userId: user.id, keyId: credential.id });
  return {
    tenantId: request.tenantId,
    userId: user.id,
    keyId: credential.id,
    key: credential.key,
    scopes: scopesFor(request),
  };
}

export async function offboardTenant(client: InfraiControlPlane, tenantId: string) {
  const record = tenantRecords.get(tenantId);
  if (!record) return false;

  await client.call({
    method: "DELETE",
    path: `/v1/account/keys/revoke/${encodeURIComponent(record.keyId)}`,
  });
  await client.call({
    method: "DELETE",
    path: `/v1/auth/user/delete/${encodeURIComponent(record.userId)}`,
  });
  tenantRecords.delete(tenantId);
  return true;
}

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readJson(request: NodeJS.ReadableStream): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function startService(client: InfraiControlPlane, port = 3000) {
  return createServer(async (request, response) => {
    try {
      if (request.method === "POST" && request.url === "/nonprofit-tenants") {
        const input = tenantRequestSchema.parse(await readJson(request));
        send(response, 201, await provisionTenant(client, input));
        return;
      }

      const match = request.url?.match(/^\/nonprofit-tenants\/([a-z0-9-]+)$/);
      if (request.method === "DELETE" && match) {
        const removed = await offboardTenant(client, match[1]);
        send(response, removed ? 200 : 404, { tenantId: match[1], offboarded: removed });
        return;
      }
      send(response, 404, { error: "Route not found" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        send(response, 400, { error: "Invalid request", issues: error.issues });
      } else if (error instanceof InfraiError) {
        const status = error.status >= 400 && error.status < 500 ? error.status : 502;
        send(response, status, { error: error.code, message: error.message });
      } else {
        send(response, 502, { error: "Upstream request did not complete" });
      }
    }
  }).listen(port);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");
  startService(new InfraiControlPlane(apiKey));
  console.log("Nonprofit tenant service listening on http://localhost:3000");
}
