import { apiError, preflight, v1 } from "@/lib/gateway";
import { SITE_URL } from "@/lib/site";

// Anything else under /v1 is answered in the API's own error shape, not with
// the website's 404 page, so SDKs can show the message.
const missing = v1(async (request) =>
  apiError(404, `No such endpoint: ${new URL(request.url).pathname}. See ${SITE_URL}/v1/openapi.json.`, "not_found"),
);

export { missing as GET, missing as POST, missing as PUT, missing as PATCH, missing as DELETE };
export const OPTIONS = preflight;
