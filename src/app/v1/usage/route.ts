import { apiError, authenticate, preflight, v1 } from "@/lib/gateway";
import { listUsage, usageByModel } from "@/lib/ledger";

// GET /v1/usage?from=2026-09-01&to=2026-10-01&limit=100&before=<id>
// Every call this wallet paid for, newest first, with a per-model summary of
// the period. `before` continues from the `next` of the previous page.
export const GET = v1(async (request) => {
  const caller = await authenticate(request);
  if (caller instanceof Response) return caller;

  const query = new URL(request.url).searchParams;
  const date = (name: string) => {
    const value = query.get(name);
    if (value === null) return undefined;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) throw new RangeError(`\`${name}\` must be a date such as 2026-09-01 or 2026-09-01T12:00:00Z.`);
    return parsed.toISOString();
  };
  let from: string | undefined;
  let to: string | undefined;
  try {
    from = date("from");
    to = date("to");
  } catch (error) {
    return apiError(400, (error as Error).message, "invalid_query");
  }
  const before = Number(query.get("before"));
  const limit = Number(query.get("limit"));

  const page = await listUsage(caller.address, {
    from,
    to,
    ...(Number.isInteger(before) && before > 0 && { before }),
    ...(Number.isInteger(limit) && limit > 0 && { limit }),
  });
  const models = await usageByModel(caller.address, { from, to });
  return Response.json({
    object: "list",
    period: { from: from ?? null, to: to ?? null },
    total_credits: models.reduce((sum, model) => sum + model.credits, 0),
    by_model: models.map((model) => ({
      model: model.model,
      calls: model.calls,
      input_tokens: model.inputTokens,
      output_tokens: model.outputTokens,
      credits: model.credits,
    })),
    data: page.rows.map((row) => ({
      id: row.id,
      created_at: row.createdAt,
      key: row.keyId === "playground" ? "playground" : row.keyId,
      model: row.model,
      input_tokens: row.inputTokens,
      output_tokens: row.outputTokens,
      credits: row.credits,
    })),
    has_more: page.next !== null,
    next: page.next,
  });
});

export const OPTIONS = preflight;
