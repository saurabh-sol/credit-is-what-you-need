import { shareMicro, splitMicro } from "./gasback.ts";

// Builder Royalties: when other people use a contract you deployed, a share of
// the gas they spend comes to you as credits. With Gas-Back at 40% this stays
// unfarmable on mainnet: calling your own contract from another wallet returns
// at most 60% of what it costs.
export const ROYALTY_PERCENT = 20;

export type ContractCall = { hash: string; from: string; ok: boolean; feeWei: string };

export type ContractStats = { contract: string; newCalls: number; newUsers: number };

export type RoyaltyPlan = {
  contracts: ContractStats[];
  payable: { hash: string; contract: string }[];
  credits: number;
  carryMicro: number;
};

export function planRoyalties(
  builder: string,
  usage: { contract: string; calls: ContractCall[] }[],
  paidHashes: Set<string>,
  carryMicro: number,
  ethUsdCents: bigint,
): RoyaltyPlan {
  const self = builder.toLowerCase();
  const payable: RoyaltyPlan["payable"] = [];
  const contracts: ContractStats[] = [];
  let fees = BigInt(0);

  for (const { contract, calls } of usage) {
    // Your own calls never count, failed calls never count, and a call pays once.
    const fresh = calls.filter(
      (call) => call.ok && call.from.toLowerCase() !== self && !paidHashes.has(call.hash),
    );
    for (const call of fresh) {
      payable.push({ hash: call.hash, contract });
      fees += BigInt(call.feeWei);
    }
    contracts.push({
      contract,
      newCalls: fresh.length,
      newUsers: new Set(fresh.map((call) => call.from.toLowerCase())).size,
    });
  }

  const micro = shareMicro(fees, ethUsdCents, ROYALTY_PERCENT) + BigInt(payable.length > 0 ? carryMicro : 0);
  const split = payable.length > 0 ? splitMicro(micro) : { credits: 0, carryMicro };
  return { contracts, payable, ...split };
}
