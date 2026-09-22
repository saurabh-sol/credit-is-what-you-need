// The Kredit token, shown as a contract address in the hero. Leave `address`
// empty and nothing is shown. `url` is where a click goes; by default the
// token's page on the mainnet explorer.
export const TOKEN = {
  symbol: "KREDIT",
  address: "0x1b69ba93b8da9cf4cbc8f9c40e7ed25347f86dd1",
  url: "",
};

export const tokenUrl = () => TOKEN.url || `https://robinhoodchain.blockscout.com/token/${TOKEN.address}`;
