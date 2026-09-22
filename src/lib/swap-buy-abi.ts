// The parts of the KreditSwapBuy contract the browser and the server share.
// The contract itself lives in contracts/src/KreditSwapBuy.sol.

export const SWAP_BUY_ABI = [
  {
    type: "function",
    name: "buyWithEth",
    stateMutability: "payable",
    inputs: [
      { name: "minTokens", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [
      { name: "amount", type: "uint256" },
      { name: "credits", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "creditsFor",
    stateMutability: "view",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  { type: "function", name: "token", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  { type: "function", name: "treasury", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  { type: "function", name: "weth", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  { type: "function", name: "poolFee", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint24" }] },
  { type: "function", name: "tokenDecimals", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint8" }] },
  { type: "function", name: "creditsPerToken", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "maxCreditsPerBuy", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "paused", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "purchased", stateMutability: "view", inputs: [{ name: "", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "totalPurchased", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  {
    type: "function",
    name: "setToken",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token_", type: "address" },
      { name: "decimals_", type: "uint8" },
      { name: "poolFee_", type: "uint24" },
      { name: "creditsPerToken_", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "event",
    name: "Purchased",
    inputs: [
      { name: "buyer", type: "address", indexed: true },
      { name: "token", type: "address", indexed: true },
      { name: "ethIn", type: "uint256", indexed: false },
      { name: "amount", type: "uint256", indexed: false },
      { name: "credits", type: "uint256", indexed: false },
    ],
  },
  { type: "error", name: "NotOwner", inputs: [] },
  { type: "error", name: "ZeroAddress", inputs: [] },
  { type: "error", name: "Paused", inputs: [] },
  { type: "error", name: "BuyingOff", inputs: [] },
  { type: "error", name: "NothingSent", inputs: [] },
  { type: "error", name: "NothingBought", inputs: [] },
  { type: "error", name: "TooMuch", inputs: [{ name: "credits", type: "uint256" }, { name: "max", type: "uint256" }] },
  { type: "error", name: "Expired", inputs: [] },
  { type: "error", name: "Reentered", inputs: [] },
  { type: "error", name: "BadFee", inputs: [] },
] as const;
