// The parts of the KreditReceipts contract the browser and the server share:
// its ABI, the EIP-712 types a receipt is signed with, and the receipt shape.
// The contract itself lives in contracts/src/KreditReceipts.sol.

export const RECEIPTS_ABI = [
  {
    type: "function",
    name: "claim",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "receipt",
        type: "tuple",
        components: [
          { name: "wallet", type: "address" },
          { name: "credits", type: "uint64" },
          { name: "txCount", type: "uint32" },
          { name: "recordRoot", type: "bytes32" },
          { name: "rulesVersion", type: "uint32" },
          { name: "referrer", type: "address" },
          { name: "nonce", type: "uint64" },
          { name: "deadline", type: "uint64" },
        ],
      },
      { name: "signature", type: "bytes" },
    ],
    outputs: [{ name: "receiptId", type: "bytes32" }],
  },
  {
    type: "function",
    name: "buy",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [{ name: "credits", type: "uint256" }],
  },
  { type: "function", name: "nonces", stateMutability: "view", inputs: [{ name: "", type: "address" }], outputs: [{ name: "", type: "uint64" }] },
  { type: "function", name: "earned", stateMutability: "view", inputs: [{ name: "", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "claimed", stateMutability: "view", inputs: [{ name: "", type: "bytes32" }], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "signer", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  { type: "function", name: "token", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  { type: "function", name: "treasury", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  { type: "function", name: "paused", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "bool" }] },
  {
    type: "event",
    name: "Claimed",
    inputs: [
      { name: "wallet", type: "address", indexed: true },
      { name: "receiptId", type: "bytes32", indexed: true },
      { name: "credits", type: "uint64", indexed: false },
      { name: "txCount", type: "uint32", indexed: false },
      { name: "recordRoot", type: "bytes32", indexed: false },
      { name: "rulesVersion", type: "uint32", indexed: false },
      { name: "referrer", type: "address", indexed: false },
      { name: "nonce", type: "uint64", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Purchased",
    inputs: [
      { name: "buyer", type: "address", indexed: true },
      { name: "token", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "credits", type: "uint256", indexed: false },
    ],
  },
] as const;

// Must match the struct and RECEIPT_TYPEHASH in the contract, field for field.
export const RECEIPT_TYPES = {
  Receipt: [
    { name: "wallet", type: "address" },
    { name: "credits", type: "uint64" },
    { name: "txCount", type: "uint32" },
    { name: "recordRoot", type: "bytes32" },
    { name: "rulesVersion", type: "uint32" },
    { name: "referrer", type: "address" },
    { name: "nonce", type: "uint64" },
    { name: "deadline", type: "uint64" },
  ],
} as const;

export const receiptDomain = (chainId: number, verifyingContract: `0x${string}`) =>
  ({ name: "Kredit", version: "1", chainId, verifyingContract }) as const;

// A receipt as it travels to the browser: numbers as strings, so nothing is
// lost in JSON, and the browser turns them back into bigints for the wallet.
export type SignedReceipt = {
  wallet: `0x${string}`;
  credits: string;
  txCount: number;
  recordRoot: `0x${string}`;
  rulesVersion: number;
  referrer: `0x${string}`;
  nonce: string;
  deadline: string;
};

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
