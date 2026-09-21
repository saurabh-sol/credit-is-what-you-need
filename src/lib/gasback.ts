// Gas-Back: a share of the gas a wallet spent comes back as credits.
// It can't be farmed at a profit on mainnet: spending $1 of gas returns $0.40.

export const GAS_BACK_PERCENT = 40;
export const MICRO = 1_000_000; // L2 fees are tiny, so we count in millionths of a credit

// feeWei / 1e18 ETH  x  cents / 100 USD  x  40%  x  1,000 credits per USD  x  1e6 micro
//   = feeWei x cents x percent / 1e13
export function shareMicro(feeWei: bigint, ethUsdCents: bigint, percent: number) {
  return (feeWei * ethUsdCents * BigInt(percent)) / BigInt(10) ** BigInt(13);
}

export const gasBackMicro = (feeWei: bigint, ethUsdCents: bigint) =>
  shareMicro(feeWei, ethUsdCents, GAS_BACK_PERCENT);

// Whole credits are paid out; the fraction is carried to the next claim.
export function splitMicro(micro: bigint) {
  return { credits: Number(micro / BigInt(MICRO)), carryMicro: Number(micro % BigInt(MICRO)) };
}
