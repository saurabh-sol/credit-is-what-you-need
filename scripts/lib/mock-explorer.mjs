// A stand-in for the Blockscout API (v2) for end-to-end tests: answers the one
// request the record scanner makes with made-up transactions for any wallet.
//   node scripts/lib/mock-explorer.mjs 8548
import http from "node:http";

const port = Number(process.argv[2] ?? 8548);
const hex = (n, width) => "0x" + n.toString(16).padStart(width, "0");

// Three days of activity: a deploy, a few contract calls, a transfer, one failure.
export const fakeTxs = (address) => [
  { hash: hex(1, 64), from: { hash: address }, timestamp: "2026-09-01T10:00:00.000000Z", status: "ok", to: null, method: null, created_contract: { hash: hex(0xc0ffee, 40) }, fee: { value: "1000" } },
  { hash: hex(2, 64), from: { hash: address }, timestamp: "2026-09-01T11:00:00.000000Z", status: "ok", to: { hash: hex(0xdead, 40), is_contract: true, name: "Router" }, method: "swap", created_contract: null, fee: { value: "1000" } },
  { hash: hex(3, 64), from: { hash: address }, timestamp: "2026-09-02T10:00:00.000000Z", status: "ok", to: { hash: hex(0xdead, 40), is_contract: true, name: "Router" }, method: "swap", created_contract: null, fee: { value: "1000" } },
  { hash: hex(4, 64), from: { hash: address }, timestamp: "2026-09-03T10:00:00.000000Z", status: "ok", to: { hash: hex(0xbeef, 40), is_contract: false, name: null }, method: null, created_contract: null, fee: { value: "1000" } },
  { hash: hex(5, 64), from: { hash: address }, timestamp: "2026-09-03T11:00:00.000000Z", status: "error", to: { hash: hex(0xdead, 40), is_contract: true, name: "Router" }, method: "swap", created_contract: null, fee: { value: "1000" } },
];

http
  .createServer((request, response) => {
    const match = /^\/addresses\/(0x[0-9a-fA-F]{40})\/transactions/.exec(request.url ?? "");
    response.setHeader("content-type", "application/json");
    if (!match) return response.writeHead(404).end(JSON.stringify({ message: "Not found" }));
    response.end(JSON.stringify({ items: fakeTxs(match[1]), next_page_params: null }));
  })
  .listen(port, () => console.log(`mock explorer on http://127.0.0.1:${port}`));
