import { describe, expect, it } from "vitest";
import { drawCard, MAJOR_ARCANA } from "@/lib/tarot/cards";

describe("MAJOR_ARCANA", () => {
  it("has exactly 22 cards with unique keys", () => {
    expect(MAJOR_ARCANA).toHaveLength(22);
    expect(new Set(MAJOR_ARCANA.map((card) => card.key)).size).toBe(22);
  });

  it("gives every card a name and at least one keyword", () => {
    for (const card of MAJOR_ARCANA) {
      expect(card.name.length).toBeGreaterThan(0);
      expect(card.keywords.length).toBeGreaterThan(0);
    }
  });
});

describe("drawCard", () => {
  it("returns a card from MAJOR_ARCANA and a valid orientation", () => {
    for (let i = 0; i < 50; i++) {
      const { card, orientation } = drawCard();
      expect(MAJOR_ARCANA).toContainEqual(card);
      expect(["upright", "reversed"]).toContain(orientation);
    }
  });

  it("draws roughly uniformly across many calls", () => {
    const seen = new Set<string>();
    const orientations = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const { card, orientation } = drawCard();
      seen.add(card.key);
      orientations.add(orientation);
    }
    // With 500 draws over 22 cards, every card and both orientations should
    // have come up at least once — a loose distribution sanity check, not a
    // statistical proof.
    expect(seen.size).toBe(22);
    expect(orientations).toEqual(new Set(["upright", "reversed"]));
  });
});
