import { heldFor } from "@/lib/budget";
import { authenticate, preflight, RATE_LIMIT, v1 } from "@/lib/gateway";
import { getBalance, getTotals } from "@/lib/ledger";
import { CREDITS_PER_USD } from "@/lib/pricing";

// The wallet behind a key, for apps that want to show a balance. Never the
// wallet's other keys or its earnings: a key sees only what it needs to spend.
export const GET = v1((request) => {
  const caller = authenticate(request);
  if (caller instanceof Response) return caller;

  const balance = getBalance(caller.address);
  const held = heldFor(caller.address);
  return Response.json({
    object: "account",
    address: caller.address,
    key: { name: caller.keyName, prefix: caller.keyPrefix },
    balance,
    held, // promised to calls still running
    available: Math.max(0, balance - held),
    usd_value: balance / CREDITS_PER_USD,
    total_spent: getTotals(caller.address).spent,
    rate_limit: { requests_per_minute: RATE_LIMIT },
  });
});

export const OPTIONS = preflight;
