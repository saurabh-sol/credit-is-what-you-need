import { createPublicClient, http, verifyMessage, type Hex } from "viem";
import { base, robinhood, robinhoodTestnet } from "viem/chains";
import { parseSiweMessage, validateSiweMessage } from "viem/siwe";
import { consumeNonce, createSession } from "@/lib/session";

const fail = (error: string, status = 400) =>
  Response.json({ error }, { status });

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const message: unknown = body?.message;
  const signature: unknown = body?.signature;
  if (typeof message !== "string" || typeof signature !== "string") {
    return fail("message and signature are required");
  }

  const nonce = await consumeNonce();
  if (!nonce) return fail("Sign-in expired, please try again", 401);

  const parsed = parseSiweMessage(message);
  const domain = request.headers.get("host") ?? undefined;
  if (!parsed.address || !validateSiweMessage({ message: parsed, nonce, domain })) {
    return fail("Invalid sign-in message", 401);
  }

  const args = { address: parsed.address, message, signature: signature as Hex };
  // Normal wallets verify locally. Smart wallets need an on-chain ERC-1271/6492
  // check on a chain where they live: Base (Base Account) or Robinhood Chain.
  const onChain = () =>
    Promise.all(
      [
        { chain: base, rpc: undefined },
        { chain: robinhood, rpc: process.env.NEXT_PUBLIC_RPC_MAINNET },
        { chain: robinhoodTestnet, rpc: process.env.NEXT_PUBLIC_RPC_TESTNET },
      ].map(({ chain, rpc }) =>
        createPublicClient({ chain, transport: http(rpc || undefined, { timeout: 10_000 }) })
          .verifyMessage(args)
          .catch(() => false),
      ),
    ).then((results) => results.some(Boolean));
  const valid = (await verifyMessage(args).catch(() => false)) || (await onChain());
  if (!valid) return fail("Signature does not match this wallet", 401);

  await createSession(parsed.address);
  return Response.json({ address: parsed.address });
}
