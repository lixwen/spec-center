import path from "node:path";
import { fileURLToPath } from "node:url";

import { getMongoCollections } from "../data/mongo";
import type { EvalDataset } from "../domain/models";
import { nowIso } from "../utils/hash";
import { createId } from "../utils/id";
import { loadDatasetFromFile } from "./dataset-loader";

const CREATED_BY = "dataset-migration";

/**
 * Import packaged `datasets/*.json` into MongoDB `eval_datasets`, grouped by example `category`.
 */
export async function main(): Promise<void> {
  const examples = loadDatasetFromFile();
  if (examples.length === 0) {
    console.log("No examples found in datasets directory; nothing to migrate.");
    return;
  }

  const byCategory = new Map<string, typeof examples>();
  for (const ex of examples) {
    const list = byCategory.get(ex.category) ?? [];
    list.push(ex);
    byCategory.set(ex.category, list);
  }

  const cols = await getMongoCollections();
  const now = nowIso();

  for (const category of [...byCategory.keys()].sort((a, b) => a.localeCompare(b))) {
    const grouped = byCategory.get(category)!;
    const existing = await cols.evalDatasets.findOne({ category });

    const doc: EvalDataset = {
      _id: existing?._id ?? createId("evaldataset"),
      name: existing?.name ?? category,
      category,
      description: existing?.description,
      examples: grouped,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      createdBy: existing?.createdBy ?? CREATED_BY
    };

    await cols.evalDatasets.replaceOne({ category }, doc, { upsert: true });
    console.log(`Upserted eval_datasets document for category "${category}" (${grouped.length} examples).`);
  }

  console.log(`Migration complete: ${byCategory.size} dataset(s).`);
}

const isDirectRun =
  typeof process.argv[1] === "string" &&
  path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);

if (isDirectRun) {
  await main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
