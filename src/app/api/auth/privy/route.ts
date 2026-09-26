import { createRemoteJWKSet, jwtVerify } from "jose";
import { getAddress, isAddress, type Address } from "viem";
import { bindInviter } from "@/lib/invite-cookie";
import { createSession } from "@/lib/session";

// Turns a Privy login into a Kredit session.
//
// The browser sends Privy's access token and the wallet it wants to be. The
// token is checked against Privy's public keys for this app, then the user is
// fetched from Privy with the app secret and the wallet is accepted only if it
// is one of that user's own Ethereum wallets. The address is the account: an
// email user gets Privy's embedded wallet, a wallet user keeps their own.

const fail = (error: string, status = 400) => Response.json({ error }, { status });

const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
const appSecret = process.env.PRIVY_APP_SECRET;

// Privy publishes each app's verification key as a JWK set; jose caches it.
const jwks = appId ? createRemoteJWKSet(new URL(`https://auth.privy.io/api/v1/apps/${appId}/jwks.json`)) : null;

type LinkedAccount = {
  type: string;
  address?: string;
  chain_type?: string;
  wallet_client_type?: string;
  connector_type?: string;
};

async function walletsOf(userId: string) {
  const response = await fetch(`https://api.privy.io/v1/users/${encodeURIComponent(userId)}`, {
    headers: {
      authorization: `Basic ${Buffer.from(`${appId}:${appSecret}`).toString("base64")}`,
      "privy-app-id": appId!,
    },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Privy user lookup failed (${response.status})`);
  const user = (await response.json()) as { linked_accounts?: LinkedAccount[] };
  return (user.linked_accounts ?? []).filter(
    (account) => account.type === "wallet" && account.chain_type === "ethereum" && account.address && isAddress(account.address),
  );
}

export async function POST(request: Request) {
  if (!appId || !appSecret || !jwks) return fail("Sign-in is not configured on this server", 503);

  const body = await request.json().catch(() => null);
  const token: unknown = body?.token;
  const wanted: unknown = body?.address;
  if (typeof token !== "string" || !token) return fail("token is required");

  let userId: string;
  try {
    const { payload } = await jwtVerify(token, jwks, { issuer: "privy.io", audience: appId });
    if (!payload.sub) throw new Error("no subject");
    userId = payload.sub;
  } catch {
    return fail("Privy login is invalid or expired", 401);
  }

  let wallets: LinkedAccount[];
  try {
    wallets = await walletsOf(userId);
  } catch {
    return fail("Could not read the account from Privy, please try again", 502);
  }
  if (wallets.length === 0) return fail("This account has no wallet yet, please try again in a moment", 409);

  // The wallet the browser asked for, if it is really theirs; otherwise the
  // embedded wallet, and failing that the first one Privy lists.
  const asked = typeof wanted === "string" && isAddress(wanted) ? wanted.toLowerCase() : null;
  const chosen =
    wallets.find((wallet) => wallet.address!.toLowerCase() === asked) ??
    wallets.find((wallet) => wallet.wallet_client_type === "privy" || wallet.connector_type === "embedded") ??
    wallets[0];
  const address: Address = getAddress(chosen.address!);

  await createSession(address);
  await bindInviter(address);
  return Response.json({ address });
}
