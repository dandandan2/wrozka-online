import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MAJOR_ARCANA } from "@/lib/tarot/cards";

/**
 * `tarot_readings.card_key` is constrained in SQL to a hand-copied list of the
 * 22 Major Arcana keys, with only a "values must stay in sync" comment guarding
 * the duplication. Without this test, adding or renaming a card in
 * `src/lib/tarot/cards.ts` passes lint, typecheck and every other test, then
 * fails in production on the first INSERT that violates the check constraint.
 */
const MIGRATIONS_DIR = path.resolve(import.meta.dirname, "../../supabase/migrations");
const CONSTRAINT_NAME = "tarot_readings_card_key_check";

function readCardKeyConstraintSql(): string {
  const matching = readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .map((file) => ({ file, sql: readFileSync(path.join(MIGRATIONS_DIR, file), "utf8") }))
    .filter((entry) => entry.sql.includes(CONSTRAINT_NAME));

  // Guards against a vacuous pass: if the migration is renamed away or the
  // constraint is split across several migrations, fail loudly instead of
  // silently testing nothing.
  expect(matching.map((entry) => entry.file)).toHaveLength(1);
  return matching[0].sql;
}

function cardKeysFromMigration(sql: string): string[] {
  const listMatch = /card_key\s+in\s*\(([^)]*)\)/i.exec(sql);
  if (!listMatch) {
    throw new Error(`expected a \`card_key in (...)\` list in the ${CONSTRAINT_NAME} migration`);
  }
  return [...listMatch[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

describe("tarot_readings_card_key_check migration", () => {
  it("allows exactly the MAJOR_ARCANA keys, no more and no fewer", () => {
    const migrationKeys = cardKeysFromMigration(readCardKeyConstraintSql());
    const cardKeys = MAJOR_ARCANA.map((card) => card.key);

    expect([...migrationKeys].sort()).toEqual([...cardKeys].sort());
  });

  it("lists each allowed key only once", () => {
    const migrationKeys = cardKeysFromMigration(readCardKeyConstraintSql());

    expect(new Set(migrationKeys).size).toBe(migrationKeys.length);
  });
});
