import assert from "node:assert/strict";
import { test } from "node:test";
import { custom } from "viem";
import { networks } from "./networks.ts";
import { methodName, scanAddressRpc } from "./rpc-scan.ts";

const WALLET = "0xbeeda2b3ca61f39bc597ea056d68268b81cc3323";
const DEX = "0x00000000000000000000000000000000000d0d0d";
const FRIEND = "0x0000000000000000000000000000000000f00d00";
const hash = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;

// A fake Alchemy: a wallet that deployed a contract, swapped on a DEX, sent a
// transfer, and had one call fail. One more transaction is not indexed yet.
function fakeRpc() {
  const calls: string[] = [];
  const txs: Record<string, { from: string; to: string | null; input: string; ok: boolean; created?: string }> = {
    [hash(1)]: { from: WALLET, to: null, input: "0x6080604052", ok: true, created: "0xC0FFEE0000000000000000000000000000000001" },
    [hash(2)]: { from: WALLET, to: DEX, input: "0x38ed1739aaaa", ok: true },
    [hash(3)]: { from: WALLET, to: FRIEND, input: "0x", ok: true },
    [hash(4)]: { from: WALLET, to: DEX, input: "0xdeadbeef00", ok: false },
    // Someone else's transaction that moved this wallet's tokens (transferFrom): must not count.
    [hash(5)]: { from: FRIEND, to: DEX, input: "0x23b872dd", ok: true },
  };
  const transport = custom({
    async request({ method, params }: { method: string; params?: unknown }) {
      calls.push(method);
      const [arg] = (params ?? []) as [Record<string, string>];
      switch (method) {
        case "alchemy_getAssetTransfers": {
          assert.equal(arg.fromAddress, WALLET);
          assert.equal((arg as unknown as { excludeZeroValue: boolean }).excludeZeroValue, false);
          const page = (n: number) => ({ hash: hash(n), blockNum: "0x10", metadata: { blockTimestamp: `2026-09-2${n}T00:00:00.000Z` } });
          return arg.pageKey
            ? { transfers: [page(4), page(5), page(2)] } // hash 2 again: a duplicate row
            : { transfers: [page(1), page(2), page(3)], pageKey: "next" };
        }
        case "eth_getTransactionByHash": {
          const tx = txs[String(params![0 as keyof typeof params])];
          return { hash: params![0 as keyof typeof params], from: tx.from, to: tx.to, input: tx.input, value: "0x0", nonce: "0x1", blockNumber: "0x10", blockHash: hash(99), transactionIndex: "0x0", gas: "0x5208", gasPrice: "0x1", type: "0x0", v: "0x1", r: "0x1", s: "0x1" };
        }
        case "eth_getTransactionReceipt": {
          const tx = txs[String(params![0 as keyof typeof params])];
          return { transactionHash: params![0 as keyof typeof params], status: tx.ok ? "0x1" : "0x0", contractAddress: tx.created ?? null, gasUsed: "0x10", effectiveGasPrice: "0x3", cumulativeGasUsed: "0x10", blockNumber: "0x10", blockHash: hash(99), from: tx.from, to: tx.to, logs: [], logsBloom: "0x", transactionIndex: "0x0", type: "0x0" };
        }
        case "eth_getCode":
          return String(params![0 as keyof typeof params]).toLowerCase() === DEX ? "0x6001" : "0x";
        case "eth_getTransactionCount":
          return "0x5"; // one more than the index knows about
        default:
          throw new Error(`unexpected ${method}`);
      }
    },
  });
  return { transport, calls };
}

test("reads a wallet's history from the Alchemy index and the chain", async () => {
  const { transport, calls } = fakeRpc();
  const result = await scanAddressRpc(networks.mainnet, WALLET.toUpperCase().replace("0X", "0x"), transport);

  assert.equal(result.truncated, false);
  assert.equal(result.unindexed, 1);
  assert.deepEqual(
    result.txs.map((tx) => [tx.hash, tx.ok, tx.toIsContract, tx.method, tx.createdContract, tx.feeWei]),
    [
      [hash(1), true, false, "0x60806040", "0xc0ffee0000000000000000000000000000000001", "48"],
      [hash(2), true, true, "swap", null, "48"],
      [hash(3), true, false, null, null, "48"],
      [hash(4), false, true, "0xdeadbeef", null, "48"],
    ],
  );
  assert.equal(result.txs[1].timestamp, "2026-09-22T00:00:00.000Z");
  assert.equal(calls.filter((call) => call === "alchemy_getAssetTransfers").length, 2);
  // The code lookup is remembered, so the second scan only asks for new targets.
  const again = await scanAddressRpc(networks.mainnet, WALLET, transport);
  assert.equal(again.txs.length, 4);
});

test("names common methods and keeps unknown selectors raw", () => {
  assert.equal(methodName("0x"), null);
  assert.equal(methodName(undefined), null);
  assert.equal(methodName("0xa9059cbb000000"), "transfer");
  assert.equal(methodName("0x3593564c"), "swap");
  assert.equal(methodName("0xABCDEF0100"), "0xabcdef01");
});
