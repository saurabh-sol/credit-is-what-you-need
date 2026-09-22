// Uniswap v3 on Robinhood Chain (chain 4663), from
// https://developers.uniswap.org/docs/protocols/v3/deployments/v3-robinhood-chain-deployments.
// WETH9 is what SwapRouter02.WETH9() and QuoterV2.WETH9() return there.
export const UNISWAP_MAINNET = {
  factory: "0x1f7d7550b1b028f7571e69a784071f0205fd2efa",
  swapRouter02: "0xcaf681a66d020601342297493863e78c959e5cb2",
  quoterV2: "0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7",
  weth: "0x0bd7d308f8e1639fab988df18a8011f41eacad73",
} as const;

// QuoterV2 answers through a revert, so it is not `view` on-chain; declaring
// it so lets it run as a plain eth_call, which is how it is meant to be used.
export const QUOTER_V2_ABI = [
  {
    type: "function",
    name: "quoteExactInputSingle",
    stateMutability: "view",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "fee", type: "uint24" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "sqrtPriceX96After", type: "uint160" },
      { name: "initializedTicksCrossed", type: "uint32" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "quoteExactOutputSingle",
    stateMutability: "view",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "fee", type: "uint24" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [
      { name: "amountIn", type: "uint256" },
      { name: "sqrtPriceX96After", type: "uint160" },
      { name: "initializedTicksCrossed", type: "uint32" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
] as const;

export const UNISWAP_V3_FACTORY_ABI = [
  {
    type: "function",
    name: "getPool",
    stateMutability: "view",
    inputs: [
      { name: "tokenA", type: "address" },
      { name: "tokenB", type: "address" },
      { name: "fee", type: "uint24" },
    ],
    outputs: [{ name: "pool", type: "address" }],
  },
] as const;

export const UNISWAP_V3_POOL_ABI = [
  { type: "function", name: "liquidity", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint128" }] },
  {
    type: "function",
    name: "slot0",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "observationIndex", type: "uint16" },
      { name: "observationCardinality", type: "uint16" },
      { name: "observationCardinalityNext", type: "uint16" },
      { name: "feeProtocol", type: "uint8" },
      { name: "unlocked", type: "bool" },
    ],
  },
] as const;

export const POOL_FEES = [100, 500, 3000, 10000] as const;
