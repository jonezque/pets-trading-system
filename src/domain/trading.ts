import { sql } from "../db/pool.ts";
import type { Sql } from "../db/pool.ts";

// All secondary-market and supply operations. Each enforces the system's
// business rules and emits notifications. Multi-step operations run inside a
// transaction so cash, inventory, listings, and bids stay consistent.

/** Domain-level error whose message is safe to show in the UI. */
export class TradeError extends Error {}

type Tx = Parameters<Parameters<Sql["begin"]>[0]>[0];

// --- helpers ---------------------------------------------------------------

async function availableCash(tx: Tx, traderId: number): Promise<number> {
  const [t] = await tx<{ cash: string }[]>`
    SELECT cash FROM traders WHERE id = ${traderId} FOR UPDATE
  `;
  if (!t) throw new TradeError("Trader not found");
  const [{ locked }] = await tx<{ locked: string }[]>`
    SELECT COALESCE(sum(amount), 0) AS locked
    FROM bids WHERE bidder_id = ${traderId} AND status = 'active'
  `;
  return Number(t.cash) - Number(locked);
}

async function breedName(tx: Tx, petId: number): Promise<string> {
  const [r] = await tx<{ breed: string }[]>`
    SELECT d.breed FROM pets p JOIN pet_dictionary d ON d.id = p.breed_id WHERE p.id = ${petId}
  `;
  return r?.breed ?? "pet";
}

async function notify(
  tx: Tx,
  n: { traderId: number; kind: string; petId: number; price?: number; counterpartyId?: number; message: string },
): Promise<void> {
  await tx`
    INSERT INTO notifications (trader_id, kind, pet_id, price, counterparty_id, message)
    VALUES (${n.traderId}, ${n.kind}, ${n.petId}, ${n.price ?? null}, ${n.counterpartyId ?? null}, ${n.message})
  `;
}

async function traderName(tx: Tx, id: number): Promise<string> {
  const [r] = await tx<{ name: string }[]>`SELECT name FROM traders WHERE id = ${id}`;
  return r?.name ?? `Trader ${id}`;
}

// --- new-supply purchases ---------------------------------------------------

export async function buyFromSupply(traderId: number, breedId: number, qty: number): Promise<void> {
  if (!Number.isInteger(qty) || qty < 1) throw new TradeError("Quantity must be a positive integer");

  await sql.begin(async (tx) => {
    const [breed] = await tx<{ id: number; base_price: string; desirability_base: string }[]>`
      SELECT id, base_price, desirability_base FROM pet_dictionary WHERE id = ${breedId}
    `;
    if (!breed) throw new TradeError("Unknown breed");

    const [supply] = await tx<{ remaining: number }[]>`
      SELECT remaining FROM supply WHERE breed_id = ${breedId} FOR UPDATE
    `;
    if (!supply || supply.remaining < qty) {
      throw new TradeError(`Not enough supply (only ${supply?.remaining ?? 0} left)`);
    }

    const unit = Number(breed.base_price);
    const cost = unit * qty;
    const available = await availableCash(tx, traderId);
    if (cost > available) {
      throw new TradeError(`Insufficient cash: need $${cost}, have $${available} available`);
    }

    await tx`UPDATE supply SET remaining = remaining - ${qty} WHERE breed_id = ${breedId}`;
    await tx`UPDATE traders SET cash = cash - ${cost} WHERE id = ${traderId}`;

    for (let i = 0; i < qty; i++) {
      const [pet] = await tx<{ id: number }[]>`
        INSERT INTO pets (breed_id, owner_id, age_years, health_pct, desirability, status)
        VALUES (${breedId}, ${traderId}, 0, 100, ${Number(breed.desirability_base)}, 'active')
        RETURNING id
      `;
      await tx`
        INSERT INTO trades (pet_id, seller_id, buyer_id, price, kind)
        VALUES (${pet.id}, ${null}, ${traderId}, ${unit}, 'retail')
      `;
    }
  });
}

// --- listings ---------------------------------------------------------------

export async function createListing(traderId: number, petId: number, askingPrice: number): Promise<void> {
  if (!(askingPrice > 0)) throw new TradeError("Asking price must be greater than 0");

  await sql.begin(async (tx) => {
    const [pet] = await tx<{ owner_id: number }[]>`SELECT owner_id FROM pets WHERE id = ${petId}`;
    if (!pet) throw new TradeError("Pet not found");
    if (pet.owner_id !== traderId) throw new TradeError("You can only list pets you own");

    const [existing] = await tx`
      SELECT id FROM listings WHERE pet_id = ${petId} AND status = 'active'
    `;
    if (existing) throw new TradeError("Pet already has an active listing");

    await tx`
      INSERT INTO listings (pet_id, seller_id, asking_price, status)
      VALUES (${petId}, ${traderId}, ${askingPrice}, 'active')
    `;
  });
}

export async function withdrawListing(traderId: number, listingId: number): Promise<void> {
  await sql.begin(async (tx) => {
    const [listing] = await tx<{ id: number; seller_id: number; pet_id: number; status: string }[]>`
      SELECT id, seller_id, pet_id, status FROM listings WHERE id = ${listingId} FOR UPDATE
    `;
    if (!listing) throw new TradeError("Listing not found");
    if (listing.seller_id !== traderId) throw new TradeError("You can only withdraw your own listings");
    if (listing.status !== "active") throw new TradeError("Listing is not active");

    // Reject the active bid (if any); locked cash is released automatically.
    const [bid] = await tx<{ id: number; bidder_id: number; amount: string }[]>`
      SELECT id, bidder_id, amount FROM bids WHERE listing_id = ${listingId} AND status = 'active' FOR UPDATE
    `;
    if (bid) {
      await tx`UPDATE bids SET status = 'rejected' WHERE id = ${bid.id}`;
      const seller = await traderName(tx, traderId);
      const breed = await breedName(tx, listing.pet_id);
      await notify(tx, {
        traderId: bid.bidder_id,
        kind: "withdrawn",
        petId: listing.pet_id,
        price: Number(bid.amount),
        counterpartyId: traderId,
        message: `Bid $${Number(bid.amount)} on ${breed} withdrawn by ${seller} (listing removed)`,
      });
    }

    await tx`UPDATE listings SET status = 'withdrawn' WHERE id = ${listingId}`;
  });
}

// --- bids -------------------------------------------------------------------

export async function placeBid(bidderId: number, listingId: number, amount: number): Promise<void> {
  if (!(amount > 0)) throw new TradeError("Bid must be greater than 0");

  await sql.begin(async (tx) => {
    const [listing] = await tx<{ id: number; seller_id: number; pet_id: number; status: string }[]>`
      SELECT id, seller_id, pet_id, status FROM listings WHERE id = ${listingId} FOR UPDATE
    `;
    if (!listing) throw new TradeError("Listing not found");
    if (listing.status !== "active") throw new TradeError("Listing is no longer active");
    if (listing.seller_id === bidderId) throw new TradeError("You cannot bid on your own pet");

    const available = await availableCash(tx, bidderId);
    if (amount > available) {
      throw new TradeError(`Bid exceeds available cash ($${available})`);
    }

    // Only the highest bid is active; a new bid must beat the current one.
    const [current] = await tx<{ id: number; bidder_id: number; amount: string }[]>`
      SELECT id, bidder_id, amount FROM bids WHERE listing_id = ${listingId} AND status = 'active' FOR UPDATE
    `;
    if (current && amount <= Number(current.amount)) {
      throw new TradeError(`Bid must exceed the current highest bid ($${Number(current.amount)})`);
    }

    const breed = await breedName(tx, listing.pet_id);

    if (current) {
      await tx`UPDATE bids SET status = 'outbid' WHERE id = ${current.id}`;
      const newBidder = await traderName(tx, bidderId);
      await notify(tx, {
        traderId: current.bidder_id,
        kind: "outbid",
        petId: listing.pet_id,
        price: Number(current.amount),
        counterpartyId: bidderId,
        message: `Your bid $${Number(current.amount)} on ${breed} was outbid by ${newBidder} ($${amount})`,
      });
    }

    await tx`
      INSERT INTO bids (listing_id, bidder_id, amount, status)
      VALUES (${listingId}, ${bidderId}, ${amount}, 'active')
    `;

    const bidderName = await traderName(tx, bidderId);
    await notify(tx, {
      traderId: listing.seller_id,
      kind: "received",
      petId: listing.pet_id,
      price: amount,
      counterpartyId: bidderId,
      message: `New highest bid $${amount} on ${breed} from ${bidderName}`,
    });
    await notify(tx, {
      traderId: bidderId,
      kind: "highest",
      petId: listing.pet_id,
      price: amount,
      counterpartyId: listing.seller_id,
      message: `Your bid $${amount} on ${breed} is currently highest`,
    });
  });
}

export async function withdrawBid(bidderId: number, bidId: number): Promise<void> {
  await sql.begin(async (tx) => {
    const [bid] = await tx<{ id: number; bidder_id: number; listing_id: number; amount: string; status: string }[]>`
      SELECT id, bidder_id, listing_id, amount, status FROM bids WHERE id = ${bidId} FOR UPDATE
    `;
    if (!bid) throw new TradeError("Bid not found");
    if (bid.bidder_id !== bidderId) throw new TradeError("You can only withdraw your own bids");
    if (bid.status !== "active") throw new TradeError("Bid is not active");

    await tx`UPDATE bids SET status = 'withdrawn' WHERE id = ${bidId}`;

    const [listing] = await tx<{ seller_id: number; pet_id: number }[]>`
      SELECT seller_id, pet_id FROM listings WHERE id = ${bid.listing_id}
    `;
    const breed = await breedName(tx, listing.pet_id);
    const bidder = await traderName(tx, bidderId);
    await notify(tx, {
      traderId: listing.seller_id,
      kind: "withdrawn",
      petId: listing.pet_id,
      price: Number(bid.amount),
      counterpartyId: bidderId,
      message: `Bid $${Number(bid.amount)} on ${breed} withdrawn by ${bidder}`,
    });
  });
}

export async function rejectBid(sellerId: number, bidId: number): Promise<void> {
  await sql.begin(async (tx) => {
    const { bid, listing } = await loadActiveBidForSeller(tx, bidId, sellerId);
    await tx`UPDATE bids SET status = 'rejected' WHERE id = ${bid.id}`;

    const breed = await breedName(tx, listing.pet_id);
    const seller = await traderName(tx, sellerId);
    await notify(tx, {
      traderId: bid.bidder_id,
      kind: "rejected",
      petId: listing.pet_id,
      price: Number(bid.amount),
      counterpartyId: sellerId,
      message: `Your bid $${Number(bid.amount)} on ${breed} was rejected by ${seller}`,
    });
  });
}

export async function acceptBid(sellerId: number, bidId: number): Promise<void> {
  await sql.begin(async (tx) => {
    const { bid, listing } = await loadActiveBidForSeller(tx, bidId, sellerId);
    const price = Number(bid.amount);
    const buyerId = bid.bidder_id;

    // Execute the trade atomically.
    await tx`UPDATE pets SET owner_id = ${buyerId} WHERE id = ${listing.pet_id}`;
    await tx`UPDATE traders SET cash = cash + ${price} WHERE id = ${sellerId}`;
    await tx`UPDATE traders SET cash = cash - ${price} WHERE id = ${buyerId}`;
    await tx`UPDATE bids SET status = 'accepted' WHERE id = ${bid.id}`;
    await tx`UPDATE listings SET status = 'sold' WHERE id = ${listing.id}`;
    await tx`
      INSERT INTO trades (pet_id, seller_id, buyer_id, price, kind)
      VALUES (${listing.pet_id}, ${sellerId}, ${buyerId}, ${price}, 'secondary')
    `;

    const breed = await breedName(tx, listing.pet_id);
    const seller = await traderName(tx, sellerId);
    const buyer = await traderName(tx, buyerId);
    await notify(tx, {
      traderId: sellerId,
      kind: "accepted",
      petId: listing.pet_id,
      price,
      counterpartyId: buyerId,
      message: `Bid accepted: sold ${breed} to ${buyer} for $${price}`,
    });
    await notify(tx, {
      traderId: buyerId,
      kind: "accepted",
      petId: listing.pet_id,
      price,
      counterpartyId: sellerId,
      message: `Your bid accepted by ${seller} for ${breed} at $${price}`,
    });
  });
}

async function loadActiveBidForSeller(tx: Tx, bidId: number, sellerId: number) {
  const [bid] = await tx<{ id: number; bidder_id: number; listing_id: number; amount: string; status: string }[]>`
    SELECT id, bidder_id, listing_id, amount, status FROM bids WHERE id = ${bidId} FOR UPDATE
  `;
  if (!bid) throw new TradeError("Bid not found");
  if (bid.status !== "active") throw new TradeError("Bid is not active");

  const [listing] = await tx<{ id: number; seller_id: number; pet_id: number; status: string }[]>`
    SELECT id, seller_id, pet_id, status FROM listings WHERE id = ${bid.listing_id} FOR UPDATE
  `;
  if (!listing || listing.status !== "active") throw new TradeError("Listing is not active");
  if (listing.seller_id !== sellerId) throw new TradeError("You can only act on bids for your own listings");
  return { bid, listing };
}
