import { getMongoCollections } from "../data/mongo";
import { deleteByFilter } from "../data/qdrant";
import { nowIso } from "../utils/hash";
import { createId } from "../utils/id";
import { processEmbeddingTask } from "./rag-service";
import { createLogger } from "../utils/logger";

const COLLECTION_NAME = "openspec_chunks";
const DEFAULT_INTERVAL_MS = 5000;
const MAX_RETRIES = 3;

const logger = createLogger("embedding-worker");

export async function pollAndProcess(): Promise<boolean> {
  const collections = await getMongoCollections();
  const task = await collections.embeddingTasks.findOneAndUpdate(
    {
      status: "pending",
      retry_count: { $lt: MAX_RETRIES }
    },
    {
      $set: { status: "processing", updated_at: nowIso() }
    },
    {
      sort: { created_at: 1 },
      returnDocument: "after"
    }
  );

  if (!task) return false;

  try {
    logger.info({ docType: task.doc_type, docId: task.doc_id, event: "embedding-task-start" }, "Processing embedding task");
    await processEmbeddingTask(task);
    await collections.embeddingTasks.updateOne(
      { _id: task._id },
      { $set: { status: "done", updated_at: nowIso() } }
    );
    logger.info({ docType: task.doc_type, docId: task.doc_id, event: "embedding-task-done" }, "Embedding task done");
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const newRetryCount = (task.retry_count ?? 0) + 1;
    const nextStatus = newRetryCount >= MAX_RETRIES ? "failed" : "pending";
    logger.error(
      {
        err: err instanceof Error ? err : new Error(errorMessage),
        docType: task.doc_type,
        docId: task.doc_id,
        event: "embedding-task-failed",
        retryCount: newRetryCount,
        maxRetries: MAX_RETRIES,
        nextStatus
      },
      "Embedding task failed"
    );
    await collections.embeddingTasks.updateOne(
      { _id: task._id },
      {
        $set: {
          status: nextStatus,
          error: errorMessage,
          retry_count: newRetryCount,
          updated_at: nowIso()
        }
      }
    );
  }

  return true;
}

export function startWorker(intervalMs: number = DEFAULT_INTERVAL_MS): () => void {
  let running = true;

  const loop = async () => {
    while (running) {
      try {
        const processed = await pollAndProcess();
        if (!processed) {
          await sleep(intervalMs);
        }
      } catch (err) {
        logger.error({ err, event: "poll-error" }, "Embedding worker poll error");
        await sleep(intervalMs);
      }
    }
  };

  loop();

  return () => {
    running = false;
  };
}

export async function reindexProject(projectId: string): Promise<number> {
  const collections = await getMongoCollections();

  try {
    await deleteByFilter(COLLECTION_NAME, {
      must: [{ key: "project_id", match: { value: projectId } }]
    });
  } catch {
    // Collection may not exist yet
  }

  await collections.embeddingTasks.deleteMany({
    project_id: projectId,
    status: { $in: ["pending", "processing"] }
  });

  const specs = await collections.specUnits.find({ project_id: projectId }).toArray();
  const latestSnapshots = new Map<string, string>();
  for (const spec of specs) {
    if (spec.working_snapshot_id) {
      latestSnapshots.set(spec._id, spec.working_snapshot_id);
    }
  }

  const changes = await collections.changes.find({ project_id: projectId }).toArray();

  const sessionIds = (
    await collections.reviewSessions.find({ project_id: projectId }).project({ _id: 1 }).toArray()
  ).map((s) => s._id);
  const comments =
    sessionIds.length > 0
      ? await collections.comments.find({ review_session_id: { $in: sessionIds } }).toArray()
      : [];

  const timestamp = nowIso();
  const tasks = [
    ...Array.from(latestSnapshots.values()).map((snapshotId) => ({
      _id: createId("embtask"),
      doc_type: "snapshot" as const,
      doc_id: snapshotId,
      project_id: projectId,
      status: "pending" as const,
      retry_count: 0,
      created_at: timestamp,
      updated_at: timestamp
    })),
    ...changes.map((change) => ({
      _id: createId("embtask"),
      doc_type: "change" as const,
      doc_id: change._id,
      project_id: projectId,
      status: "pending" as const,
      retry_count: 0,
      created_at: timestamp,
      updated_at: timestamp
    })),
    ...comments.map((comment) => ({
      _id: createId("embtask"),
      doc_type: "comment" as const,
      doc_id: comment._id,
      project_id: projectId,
      status: "pending" as const,
      retry_count: 0,
      created_at: timestamp,
      updated_at: timestamp
    }))
  ];

  if (tasks.length > 0) {
    await collections.embeddingTasks.insertMany(tasks);
  }

  return tasks.length;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
