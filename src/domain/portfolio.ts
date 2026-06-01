// Pure portfolio math. Given a trader's cash, active-bid amounts, and the
// intrinsic value of each owned pet, derive the standard money views.

export type PortfolioInput = {
  cash: number;            // total owned cash (includes amounts currently locked)
  activeBidAmounts: number[]; // amount of each of the trader's active bids
  petValues: number[];     // intrinsic value of each owned pet (expired -> 0)
};

export type Portfolio = {
  available: number; // spendable cash = cash - locked
  locked: number;    // sum of active bid amounts
  petsValue: number; // market (intrinsic) value of inventory
  total: number;     // available + locked + petsValue
};

export function computePortfolio(input: PortfolioInput): Portfolio {
  const locked = sum(input.activeBidAmounts);
  const available = round2(input.cash - locked);
  const petsValue = round2(sum(input.petValues));
  const total = round2(available + locked + petsValue);
  return { available, locked: round2(locked), petsValue, total };
}

function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
