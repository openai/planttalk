// Loads .env into process.env. This lives in its own module so it can be the
// FIRST import in server/index.ts — ES module imports are evaluated before any
// other code in the importing file runs, so this is the only way to guarantee
// the environment is ready before other modules read it.
//
// Node has supported .env files natively since v20.12 — no dotenv package needed.
try {
  process.loadEnvFile();
} catch {
  // No .env file — rely on real environment variables.
}
