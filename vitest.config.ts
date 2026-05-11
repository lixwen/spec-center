import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vitest/config";

function loadDotenv(): Record<string, string> {
  const envPath = path.resolve(process.cwd(), ".env");
  const vars: Record<string, string> = {};
  try {
    const content = fs.readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      vars[key] = val;
    }
  } catch {
    // .env not present — use defaults
  }
  return vars;
}

const dotenv = loadDotenv();
const testDb = "spec-center-test";
const rootUser = process.env.MONGO_ROOT_USERNAME ?? dotenv.MONGO_ROOT_USERNAME ?? "openspec";
const rootPass = process.env.MONGO_ROOT_PASSWORD ?? dotenv.MONGO_ROOT_PASSWORD ?? "";
const mongoUrl =
  process.env.OPENSPEC_MONGODB_URL ??
  (rootPass
    ? `mongodb://${rootUser}:${rootPass}@127.0.0.1:27017/${testDb}?authSource=admin`
    : "mongodb://127.0.0.1:27017");

export default defineConfig({
  resolve: {
    alias: {
      "@spec-center/core": path.resolve(__dirname, "packages/core/src/index.ts")
    }
  },
  test: {
    include: ["packages/**/*.test.ts", "tests/**/*.test.ts"],
    env: {
      OPENSPEC_MONGODB_DB: testDb,
      OPENSPEC_MONGODB_URL: mongoUrl
    }
  }
});
