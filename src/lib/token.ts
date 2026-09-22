// The Kredit token, shown as a contract address in the hero. Leave `address`
// empty and nothing is shown. `url` is where a click goes: its page on Pons,
// the launchpad it trades on; without one, the mainnet explorer.
export const TOKEN = {
  symbol: "KRED",
  address: "0x1b69ba93b8da9cf4cbc8f9c40e7ed25347f86dd1",
  url: "https://www.ponsfamily.com/launchpad/0x1b69ba93b8da9cf4cbc8f9c40e7ed25347f86dd1",
};

export const tokenUrl = () => TOKEN.url || `https://robinhoodchain.blockscout.com/token/${TOKEN.address}`;
