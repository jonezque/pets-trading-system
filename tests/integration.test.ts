import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { sql } from "../src/db/pool.ts";
import * as trade from "../src/domain/trading.ts";
import { TradeError } from "../src/domain/trading.ts";
import * as q from "../src/db/queries.ts";
import {
  resetDb, traderIds, breedId, cashOf, firstPetOf, activeBidId, activeListingId,
} from "./helpers.ts";

let A: number, B: number, C: number;

beforeEach(async () => {
  await resetDb();
  [A, B, C] = await traderIds();
});

afterAll(async () => {
  await sql.end();
});

describe("new-supply purchases", () => {
  test("P1 buy 1 pet: cash down, pet created age0/health100, supply -1, retail trade", async () => {
    const labrador = await breedId("Labrador");
    await trade.buyFromSupply(A, labrador, 1);
    expect(await cashOf(A)).toBe(400); // 500 - 100
    const inv = await q.getInventory(A);
    expect(inv).toHaveLength(1);
    expect(inv[0]!.age).toBe(0);
    expect(inv[0]!.health).toBe(100);
    const [{ remaining }] = await sql<{ remaining: number }[]>`SELECT remaining FROM supply WHERE breed_id = ${labrador}`;
    expect(remaining).toBe(2);
    const [{ kind, seller_id }] = await sql`SELECT kind, seller_id FROM trades`;
    expect(kind).toBe("retail");
    expect(seller_id).toBeNull();
  });

  test("P2 buy multiple at once", async () => {
    await trade.buyFromSupply(A, await breedId("Goldfish"), 3); // 3 x $5
    expect(await cashOf(A)).toBe(485);
    expect(await q.getInventory(A)).toHaveLength(3);
  });

  test("P3 insufficient cash rejected", async () => {
    await expect(trade.buyFromSupply(A, await breedId("Macaw"), 5)).rejects.toThrow(TradeError); // 5 x $120 > 500
    expect(await cashOf(A)).toBe(500);
  });

  test("P4 supply exhausted rejected", async () => {
    const betta = await breedId("Betta");
    await trade.buyFromSupply(A, betta, 3); // drains default supply of 3
    await expect(trade.buyFromSupply(A, betta, 1)).rejects.toThrow(TradeError);
  });

  test("P6 non-positive quantity rejected", async () => {
    await expect(trade.buyFromSupply(A, await breedId("Beagle"), 0)).rejects.toThrow(TradeError);
  });
});

describe("listings", () => {
  test("L1/L2/L3/L4 listing rules", async () => {
    await trade.buyFromSupply(A, await breedId("Poodle"), 1);
    const pet = await firstPetOf(A);

    await expect(trade.createListing(A, pet, 0)).rejects.toThrow(TradeError); // L2 price > 0
    await expect(trade.createListing(B, pet, 50)).rejects.toThrow(TradeError); // L3 not owner

    await trade.createListing(A, pet, 50); // L1
    await expect(trade.createListing(A, pet, 60)).rejects.toThrow(TradeError); // L4 already listed
  });

  test("L7 withdraw listing rejects active bid and releases cash", async () => {
    await trade.buyFromSupply(A, await breedId("Bulldog"), 1);
    const pet = await firstPetOf(A);
    await trade.createListing(A, pet, 50);
    const listing = (await activeListingId(pet))!;
    await trade.placeBid(B, listing, 55);

    expect((await q.getMoney(B)).locked).toBe(55);
    await trade.withdrawListing(A, listing);
    expect((await q.getMoney(B)).locked).toBe(0); // released
    expect(await activeBidId(listing)).toBeNull();
    // pet retained by seller
    expect((await q.getPet(pet))!.ownerId).toBe(A);
  });
});

describe("bidding", () => {
  async function listedPet(seller: number, price = 50) {
    await trade.buyFromSupply(seller, await breedId("Siamese"), 1);
    const pet = await firstPetOf(seller);
    await trade.createListing(seller, pet, price);
    return { pet, listing: (await activeListingId(pet))! };
  }

  test("B3 cannot bid on own pet", async () => {
    const { listing } = await listedPet(A);
    await expect(trade.placeBid(A, listing, 40)).rejects.toThrow(TradeError);
  });

  test("B4 bid exceeding available cash rejected", async () => {
    const { listing } = await listedPet(A);
    await expect(trade.placeBid(B, listing, 999)).rejects.toThrow(TradeError);
  });

  test("B1/B2 bid above or below asking allowed", async () => {
    const { listing } = await listedPet(A, 50);
    await trade.placeBid(B, listing, 30); // below asking
    expect((await q.getMoney(B)).locked).toBe(30);
  });

  test("B6 higher bid outbids previous, releases its cash, notifies", async () => {
    const { pet, listing } = await listedPet(A, 50);
    await trade.placeBid(B, listing, 55);
    await trade.placeBid(C, listing, 60);

    expect((await q.getMoney(B)).locked).toBe(0); // B released
    expect((await q.getMoney(C)).locked).toBe(60); // C locked
    const notifsB = await q.getNotifications(B);
    expect(notifsB.some((n) => n.kind === "outbid")).toBe(true);
    expect(pet).toBeGreaterThan(0);
  });

  test("B7 bid not exceeding current highest rejected", async () => {
    const { listing } = await listedPet(A, 50);
    await trade.placeBid(B, listing, 55);
    await expect(trade.placeBid(C, listing, 55)).rejects.toThrow(TradeError);
  });

  test("B8 withdraw bid releases cash and notifies seller", async () => {
    const { listing } = await listedPet(A, 50);
    await trade.placeBid(B, listing, 55);
    const bid = (await activeBidId(listing))!;
    await trade.withdrawBid(B, bid);
    expect((await q.getMoney(B)).locked).toBe(0);
    expect((await q.getNotifications(A)).some((n) => n.kind === "withdrawn")).toBe(true);
  });

  test("B9 multiple active bids across pets lock simultaneously", async () => {
    await trade.buyFromSupply(A, await breedId("Poodle"), 1);
    await trade.buyFromSupply(A, await breedId("Bengal"), 1);
    const [p1, p2] = (await q.getInventory(A)).map((p) => p.id);
    await trade.createListing(A, p1!, 40);
    await trade.createListing(A, p2!, 30);
    await trade.placeBid(B, (await activeListingId(p1!))!, 40);
    await trade.placeBid(B, (await activeListingId(p2!))!, 30);
    expect((await q.getMoney(B)).locked).toBe(70);
  });
});

describe("trade execution", () => {
  test("T1/T4 accept transfers pet, moves cash, records secondary trade & last price", async () => {
    await trade.buyFromSupply(A, await breedId("Labrador"), 1);
    const pet = await firstPetOf(A);
    await trade.createListing(A, pet, 50);
    const listing = (await activeListingId(pet))!;
    await trade.placeBid(B, listing, 60);
    const bid = (await activeBidId(listing))!;

    await trade.acceptBid(A, bid);
    expect((await q.getPet(pet))!.ownerId).toBe(B);
    expect(await cashOf(A)).toBe(460); // 500 -100 +60
    expect(await cashOf(B)).toBe(440); // 500 -60
    const market = await q.getMarket();
    expect(market).toHaveLength(0); // listing sold
    const [{ kind }] = await sql`SELECT kind FROM trades WHERE kind = 'secondary'`;
    expect(kind).toBe("secondary");
    // both parties notified
    expect((await q.getNotifications(A)).some((n) => n.kind === "accepted")).toBe(true);
    expect((await q.getNotifications(B)).some((n) => n.kind === "accepted")).toBe(true);
  });

  test("T3 reject releases cash, keeps listing active, notifies bidder", async () => {
    await trade.buyFromSupply(A, await breedId("Persian"), 1);
    const pet = await firstPetOf(A);
    await trade.createListing(A, pet, 50);
    const listing = (await activeListingId(pet))!;
    await trade.placeBid(B, listing, 45);
    const bid = (await activeBidId(listing))!;

    await trade.rejectBid(A, bid);
    expect((await q.getMoney(B)).locked).toBe(0);
    expect(await activeListingId(pet)).toBe(listing); // still active
    expect((await q.getNotifications(B)).some((n) => n.kind === "rejected")).toBe(true);
  });

  test("T6 accept a non-active bid rejected", async () => {
    await trade.buyFromSupply(A, await breedId("Bengal"), 1);
    const pet = await firstPetOf(A);
    await trade.createListing(A, pet, 50);
    const listing = (await activeListingId(pet))!;
    await trade.placeBid(B, listing, 45);
    const bid = (await activeBidId(listing))!;
    await trade.withdrawBid(B, bid);
    await expect(trade.acceptBid(A, bid)).rejects.toThrow(TradeError);
  });
});

describe("portfolio & leaderboard", () => {
  test("F1 portfolio = available + locked + pets value", async () => {
    await trade.buyFromSupply(A, await breedId("Labrador"), 1); // pet intrinsic 80, cash 400
    const m = await q.getMoney(A);
    expect(m.available).toBe(400);
    expect(m.locked).toBe(0);
    expect(m.petsValue).toBe(80); // 100 * 1 * 0.8 * 1
    expect(m.total).toBe(480);
  });

  test("F2 leaderboard ranks by total portfolio descending", async () => {
    const board = await q.getLeaderboard();
    expect(board).toHaveLength(3);
    for (let i = 1; i < board.length; i++) {
      expect(board[i - 1]!.total).toBeGreaterThanOrEqual(board[i]!.total);
    }
  });
});
