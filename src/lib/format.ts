export const shortAddress = (address: string) =>
  `${address.slice(0, 6)}…${address.slice(-4)}`;

export const formatCredits = (credits: number) =>
  new Intl.NumberFormat("en-US").format(credits);
