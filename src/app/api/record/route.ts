import { ExplorerError } from "@/lib/explorer";
import { claimGate, SCANS_PER_MINUTE, walletAgeDays } from "@/lib/fairness";
import { rateLimited } from "@/lib/gateway";
import { budgetLeft, previewClaim, riskHold } from "@/lib/ledger";
import { isNetworkId, networks, type NetworkId } from "@/lib/networks";
import { receiptsConfig } from "@/lib/receipts";
import { scanRecord } from "@/lib/record";
import { getSession } from "@/lib/session";

const RECENT_TASKS = 25;

function onchainInfo(networkId: NetworkId) {
  const config = receiptsConfig(networkId);
  return config && { contract: config.contract, chainId: config.chainId };
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Sign in first" }, { status: 401 });

  const limited = rateLimited(`scan:${session.address.toLowerCase()}`, undefined, SCANS_PER_MINUTE);
  if (limited) return Response.json({ error: `Scans are limited to ${SCANS_PER_MINUTE} a minute.` }, { status: 429 });

  const networkId = new URL(request.url).searchParams.get("network") ?? "mainnet";
  if (!isNetworkId(networkId)) {
    return Response.json({ error: "network must be mainnet" }, { status: 400 });
  }
  const network = networks[networkId];

  try {
    // You can only scan the wallet you proved you own.
    const { receipt, truncated, unindexed, txs } = await scanRecord(network, session.address);
    const plan = await previewClaim(session.address, networkId, receipt.tasks);
    const gate = claimGate(txs, truncated);
    // A hold is only written when a claim is attempted; here it is read so
    // the dashboard can say so before the button is pressed.
    const hold = gate ? null : await riskHold(session.address, networkId, plan, receipt.tasks, walletAgeDays(txs, truncated));
    return Response.json({
      address: session.address,
      network: { id: network.id, name: network.name, explorerUrl: network.explorerUrl },
      truncated,
      unindexed,
      ...receipt,
      tasks: receipt.tasks.slice(0, RECENT_TASKS),
      claimable: gate ? 0 : plan.total,
      // Why the button is off, when it is: a young wallet, or a held claim.
      blocked: gate ? { code: gate.code, message: gate.message, until: gate.until } : hold ? { code: "held", message: hold.reason, until: hold.until } : null,
      // Task credits waiting for a later day's emissions budget.
      deferred: plan.deferred,
      budgetLeft: await budgetLeft(networkId),
      // Set when claims on this network go through the KreditReceipts contract.
      onchain: onchainInfo(networkId),
    });
  } catch (error) {
    if (error instanceof ExplorerError) {
      return Response.json({ error: error.message }, { status: 502 });
    }
    throw error;
  }
}
