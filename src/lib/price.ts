import { createPublicClient, fallback, http, parseAbi, type Address } from "viem";
import { mainnet } from "viem/chains";

// ETH is the gas token on Robinhood Chain and its price is the same everywhere,
// so by default we read Chainlink's ETH/USD feed on Ethereum. Point these at
// Robinhood Chain's own feed (docs.chain.link, network "robinhood") if you prefer.
const FEED = (process.env.PRICE_FEED_ADDRESS ?? "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419") as Address;
const MAX_AGE_SECONDS = 3 * 60 * 60; // the feed updates at least hourly
const CACHE_MS = 5 * 60 * 1000;

const abi = parseAbi([
  "function latestRoundData() view returns (uint80, int256 answer, uint256, uint256 updatedAt, uint80)",
  "function decimals() view returns (uint8)",
]);

export class PriceError extends Error {}

let cached: { cents: bigint; expires: number } | undefined;

export async function getEthUsdCents() {
  if (cached && cached.expires > Date.now()) return cached.cents;

  const client = createPublicClient({
    chain: mainnet,
    transport: fallback([
      ...(process.env.PRICE_FEED_RPC_URL ? [http(process.env.PRICE_FEED_RPC_URL)] : []),
      http("https://ethereum-rpc.publicnode.com", { timeout: 10_000 }),
      http(undefined, { timeout: 10_000 }),
    ]),
  });

  try {
    const [decimals, round] = await Promise.all([
      client.readContract({ address: FEED, abi, functionName: "decimals" }),
      client.readContract({ address: FEED, abi, functionName: "latestRoundData" }),
    ]);
    const [, answer, , updatedAt] = round;
    const age = Math.floor(Date.now() / 1000) - Number(updatedAt);
    if (answer <= BigInt(0) || age > MAX_AGE_SECONDS) throw new PriceError("The ETH price feed is stale.");

    const cents = (answer * BigInt(100)) / BigInt(10) ** BigInt(decimals);
    cached = { cents, expires: Date.now() + CACHE_MS };
    return cents;
  } catch (error) {
    if (error instanceof PriceError) throw error;
    throw new PriceError("The ETH price feed could not be reached.");
  }
}

// Gas-Back is a bonus: when the price is unavailable, everything else still works
// and the Gas-Back stays claimable for later.
export const getEthUsdCentsOrNull = () => getEthUsdCents().catch(() => null);
