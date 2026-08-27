import path from "node:path";

try {
  process.loadEnvFile(path.resolve(import.meta.dirname, "../../.env.test"));
} catch {
  // .env.test is optional — dummy defaults below cover every hermetic test.
}

const DUMMY_ANON_JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" +
  ".eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlLWRlbW8iLCJzdWIiOiJkdW1teSJ9" +
  ".dummy-signature-not-verified";

export const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
export const SUPABASE_KEY = process.env.SUPABASE_KEY ?? DUMMY_ANON_JWT;
export const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? "dummy-openrouter-key";
