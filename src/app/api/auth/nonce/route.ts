import { generateSiweNonce } from "viem/siwe";
import { issueNonce } from "@/lib/session";

export async function GET() {
  const nonce = generateSiweNonce();
  await issueNonce(nonce);
  return Response.json({ nonce });
}
