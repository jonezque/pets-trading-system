// The read-only pet dictionary (20 breeds: 5 dogs, 5 cats, 5 birds, 5 fish).
// Columns: type, breed, lifespan(yrs), desirability(1-10), maintenance, base_price.
// Values transcribed verbatim from the system requirements.

export type DictEntry = {
  type: "dog" | "cat" | "bird" | "fish";
  breed: string;
  lifespan: number;
  desirability: number;
  maintenance: number;
  basePrice: number;
};

export const DICTIONARY: DictEntry[] = [
  { type: "dog", breed: "Labrador", lifespan: 12, desirability: 8, maintenance: 5, basePrice: 100 },
  { type: "dog", breed: "Beagle", lifespan: 13, desirability: 7, maintenance: 4, basePrice: 90 },
  { type: "dog", breed: "Poodle", lifespan: 14, desirability: 9, maintenance: 6, basePrice: 110 },
  { type: "dog", breed: "Bulldog", lifespan: 10, desirability: 6, maintenance: 7, basePrice: 80 },
  { type: "dog", breed: "Pit Bull", lifespan: 11, desirability: 5, maintenance: 5, basePrice: 70 },
  { type: "cat", breed: "Siamese", lifespan: 15, desirability: 9, maintenance: 4, basePrice: 90 },
  { type: "cat", breed: "Persian", lifespan: 14, desirability: 8, maintenance: 6, basePrice: 85 },
  { type: "cat", breed: "Maine Coon", lifespan: 16, desirability: 7, maintenance: 5, basePrice: 80 },
  { type: "cat", breed: "Bengal", lifespan: 12, desirability: 6, maintenance: 5, basePrice: 75 },
  { type: "cat", breed: "Sphynx", lifespan: 13, desirability: 5, maintenance: 7, basePrice: 70 },
  { type: "bird", breed: "Parakeet", lifespan: 8, desirability: 7, maintenance: 3, basePrice: 25 },
  { type: "bird", breed: "Canary", lifespan: 10, desirability: 6, maintenance: 2, basePrice: 20 },
  { type: "bird", breed: "Cockatiel", lifespan: 12, desirability: 8, maintenance: 3, basePrice: 30 },
  { type: "bird", breed: "Macaw", lifespan: 50, desirability: 9, maintenance: 8, basePrice: 120 },
  { type: "bird", breed: "Lovebird", lifespan: 15, desirability: 5, maintenance: 3, basePrice: 15 },
  { type: "fish", breed: "Goldfish", lifespan: 10, desirability: 5, maintenance: 2, basePrice: 5 },
  { type: "fish", breed: "Betta", lifespan: 5, desirability: 6, maintenance: 1, basePrice: 6 },
  { type: "fish", breed: "Guppy", lifespan: 3, desirability: 4, maintenance: 1, basePrice: 4 },
  { type: "fish", breed: "Angelfish", lifespan: 8, desirability: 7, maintenance: 2, basePrice: 8 },
  { type: "fish", breed: "Clownfish", lifespan: 6, desirability: 8, maintenance: 3, basePrice: 10 },
];
