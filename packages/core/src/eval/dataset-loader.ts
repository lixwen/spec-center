import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prettifyError, z } from "zod/v4";

import { getMongoCollections } from "../data/mongo";
import type { EvalExample } from "../domain/models";
import { sha256 } from "../utils/hash";

const evalExpectedSchema = z.object({
  keywords: z.array(z.string()).optional(),
  tools_used: z.array(z.string()).optional(),
  max_rounds: z.number().optional(),
  should_not_contain: z.array(z.string()).optional(),
  reference_answer: z.string().optional()
});

export const evalExampleSchema = z.object({
  id: z.string().min(1),
  category: z.string().min(1),
  input: z.string().min(1),
  context: z
    .object({
      projectIds: z.array(z.string())
    })
    .optional(),
  expected: evalExpectedSchema.optional()
});

export type EvalExampleInput = z.infer<typeof evalExampleSchema>;

function resolveDatasetsDir(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const nextToModule = path.resolve(moduleDir, "datasets");
  if (fs.existsSync(nextToModule)) {
    return nextToModule;
  }
  const bundledEvalDatasets = path.resolve(moduleDir, "eval", "datasets");
  if (fs.existsSync(bundledEvalDatasets)) {
    return bundledEvalDatasets;
  }
  return nextToModule;
}

function readDatasetFile(file: string): unknown {
  let raw: string;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch (e) {
    throw new Error(
      `Cannot read dataset file ${file}: ${e instanceof Error ? e.message : String(e)}`
    );
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch (e) {
    throw new Error(
      `Invalid JSON in ${file}: ${e instanceof Error ? e.message : String(e)}`
    );
  }
}

function examplesFromParsed(file: string, parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) {
    return parsed;
  }
  if (
    parsed !== null &&
    typeof parsed === "object" &&
    "examples" in parsed &&
    Array.isArray((parsed as { examples: unknown }).examples)
  ) {
    return (parsed as { examples: unknown[] }).examples;
  }
  throw new Error(
    `Dataset ${file} must be a JSON array of examples or an object { "examples": [...] }`
  );
}

/**
 * Load evaluation examples from packaged JSON datasets (synchronous).
 *
 * @param category - If set, loads only `{category}.json` from the datasets directory.
 *                   If omitted, loads and merges every `.json` file in that directory.
 */
export function loadDatasetFromFile(category?: string): EvalExample[] {
  const dir = resolveDatasetsDir();
  const files: string[] = [];

  if (category !== undefined && category !== "") {
    const file = path.resolve(dir, `${category}.json`);
    if (!fs.existsSync(file)) {
      throw new Error(`Dataset file not found: ${file}`);
    }
    files.push(file);
  } else {
    if (!fs.existsSync(dir)) {
      return [];
    }
    for (const name of fs.readdirSync(dir).sort()) {
      if (name.endsWith(".json")) {
        files.push(path.resolve(dir, name));
      }
    }
  }

  const examples: EvalExample[] = [];

  for (const file of files) {
    const parsed = readDatasetFile(file);
    const arr = examplesFromParsed(file, parsed);
    for (let i = 0; i < arr.length; i++) {
      const item = arr[i];
      const idHint =
        item !== null && typeof item === "object" && "id" in item
          ? String((item as { id: unknown }).id)
          : "unknown";
      const result = evalExampleSchema.safeParse(item);
      if (!result.success) {
        throw new Error(
          `Validation failed in ${path.basename(file)} [${i}] (id: ${idHint}):\n${prettifyError(result.error)}`
        );
      }
      examples.push(result.data);
    }
  }

  return examples;
}

/**
 * Load evaluation examples from MongoDB `eval_datasets` documents.
 * Examples are flattened from all matching datasets and validated with `evalExampleSchema`.
 */
export async function loadDatasetFromMongo(category?: string): Promise<EvalExample[]> {
  const cols = await getMongoCollections();
  const filter =
    category !== undefined && category !== "" ? { category } : {};
  const docs = await cols.evalDatasets.find(filter).sort({ category: 1 }).toArray();

  const examples: EvalExample[] = [];

  for (const doc of docs) {
    for (let i = 0; i < doc.examples.length; i++) {
      const item = doc.examples[i] as unknown;
      const idHint =
        item !== null && typeof item === "object" && "id" in item
          ? String((item as { id: unknown }).id)
          : "unknown";
      const result = evalExampleSchema.safeParse(item);
      if (!result.success) {
        throw new Error(
          `Validation failed in MongoDB dataset "${doc.category}" [${i}] (id: ${idHint}):\n${prettifyError(result.error)}`
        );
      }
      examples.push(result.data);
    }
  }

  return examples;
}

/**
 * Load evaluation examples from MongoDB or packaged JSON datasets.
 *
 * @param category - Passed through to the selected loader (file: `{category}.json`; mongo: filter datasets by category).
 * @param source - `"file"` keeps CLI/local behavior; `"mongo"` tries MongoDB first and falls back to files if empty.
 */
export async function loadDataset(
  category?: string,
  source: "mongo" | "file" = "file"
): Promise<EvalExample[]> {
  if (source === "file") {
    return loadDatasetFromFile(category);
  }

  const fromMongo = await loadDatasetFromMongo(category);
  if (fromMongo.length === 0) {
    return loadDatasetFromFile(category);
  }
  return fromMongo;
}

/** Stable fingerprint of loaded examples for `EvalRun.datasetVersion`. */
export function computeDatasetVersion(examples: EvalExample[]): string {
  const sorted = [...examples].sort((a, b) => a.id.localeCompare(b.id));
  const payload = sorted.map((e) => JSON.stringify(e)).join("\n");
  return sha256(payload).replace(/^sha256:/, "").slice(0, 16);
}
