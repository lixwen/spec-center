import { resolve } from "path";
import { existsSync } from "fs";
import { ensureMongoBootstrap } from "./data/mongo";
import { startWorker, reindexProject } from "./services/embedding-worker";
import { createLogger } from "./utils/logger";

const logger = createLogger("worker-main");

function loadEnv() {
  const candidates = [
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), "../../.env"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      process.loadEnvFile(p);
      return;
    }
  }
}
loadEnv();

const args = process.argv.slice(2);

async function main() {
  await ensureMongoBootstrap();

  const reindexIdx = args.indexOf("--reindex");
  if (reindexIdx !== -1) {
    const projectId = args[reindexIdx + 1];
    if (!projectId) {
      logger.error({ event: "cli-usage" }, "Usage: --reindex <projectId>");
      process.exit(1);
    }
    logger.info({ projectId, event: "reindex-start" }, "Reindexing project");
    const count = await reindexProject(projectId);
    logger.info({ projectId, taskCount: count, event: "reindex-tasks-created" }, "Created embedding tasks");
  }

  const intervalIdx = args.indexOf("--interval");
  const intervalMs = intervalIdx !== -1 ? Number(args[intervalIdx + 1]) || 5000 : 5000;

  logger.info({ intervalMs, event: "worker-start" }, "Starting embedding worker");
  startWorker(intervalMs);
}

main().catch((err) => {
  logger.error({ err, event: "worker-fatal" }, "Worker failed");
  process.exit(1);
});
