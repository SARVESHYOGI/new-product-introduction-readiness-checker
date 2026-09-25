/**
 * Create and provision the integration-test database.
 *
 *   npm run db:test:setup
 *
 * The test suite is self-contained: it wipes and reseeds this database on every
 * run. This script only has to make sure the database *exists* and carries the
 * current schema, so `npm test` works from a clean machine.
 *
 * It never touches DATABASE_URL (the dev database) — only TEST_DATABASE_URL.
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { Client } from "pg";

const require = createRequire(import.meta.url);

/** Absolute path to the installed Prisma CLI entry point. */
const PRISMA_CLI = require.resolve("prisma/build/index.js");

const testUrl = process.env.TEST_DATABASE_URL;

if (!testUrl) {
  console.error(
    "TEST_DATABASE_URL is not set. Copy .env.example to .env and point it at a " +
      "dedicated test database (never your dev database)."
  );
  process.exit(1);
}

const target = new URL(testUrl);
const database = decodeURIComponent(target.pathname.replace(/^\//, ""));

// CREATE DATABASE cannot be parameterised, so the identifier is validated
// rather than escaped-and-hoped.
if (!/^[A-Za-z_][A-Za-z0-9_$]*$/.test(database)) {
  console.error("TEST_DATABASE_URL must contain a plain, unquoted database name.");
  process.exit(1);
}

function isLocal(hostname) {
  return ["localhost", "127.0.0.1", "::1"].includes(hostname.toLowerCase());
}

/** Connection to the maintenance database on the same server. */
function adminConnectionString() {
  const url = new URL(testUrl);
  url.pathname = "/postgres";
  // A transaction pooler cannot run CREATE DATABASE.
  url.searchParams.delete("pgbouncer");
  return url.toString();
}

async function ensureDatabase() {
  const client = new Client({
    connectionString: adminConnectionString(),
    ssl: isLocal(target.hostname) ? false : { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    const { rowCount } = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [database]
    );
    if (rowCount && rowCount > 0) {
      console.log(`Test database "${database}" already exists.`);
      return;
    }
    await client.query(`CREATE DATABASE "${database}"`);
    console.log(`Created test database "${database}".`);
  } finally {
    await client.end();
  }
}

function prisma(args) {
  console.log(`> prisma ${args.join(" ")}`);
  // Run the Prisma CLI's JS entry point with the current Node binary. This
  // avoids `shell: true` entirely: on Windows, spawning npx.cmd without a shell
  // fails with EINVAL, and a shell would concatenate arguments into a command
  // line instead of passing them as an array.
  const result = spawnSync(process.execPath, [PRISMA_CLI, ...args], {
    stdio: "inherit",
    // Prisma CLI and the seed both read DATABASE_URL from the environment.
    env: { ...process.env, DATABASE_URL: testUrl },
  });
  if (result.error) {
    console.error(`Could not run prisma: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`prisma ${args.join(" ")} failed with exit code ${result.status}.`);
    process.exit(result.status ?? 1);
  }
}

await ensureDatabase();
prisma(["migrate", "deploy"]);
prisma(["db", "seed"]);

console.log(`Test database "${database}" is ready. Run: npm test`);
