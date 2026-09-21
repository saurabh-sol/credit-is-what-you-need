// Scan any address from the terminal: node scripts/scan.ts <address> [testnet|mainnet]
import { scanAddress } from "../src/lib/explorer.ts";
import { isNetworkId, networks } from "../src/lib/networks.ts";
import { buildReceipt } from "../src/lib/scoring.ts";

const [address, networkId = "testnet"] = process.argv.slice(2);
if (!address || !isNetworkId(networkId)) {
  console.error("usage: node scripts/scan.ts <address> [testnet|mainnet]");
  process.exit(1);
}

const network = networks[networkId];
const { txs, truncated } = await scanAddress(network, address);
const receipt = buildReceipt(txs, network.partners);

console.log(`${address} on ${network.name}`);
console.log(`${receipt.successfulTxs} successful, ${receipt.failedTxs} failed${truncated ? " (truncated)" : ""}`);
for (const line of receipt.lines) console.log(`  ${line.label.padEnd(40)} ${String(line.credits).padStart(7)}`);
console.log(`  ${"TOTAL".padEnd(40)} ${String(receipt.total).padStart(7)}`);
console.log(`gas spent: ${receipt.gasSpentWei} wei`);
