import { getMongoCollections } from "../data/mongo";
import { printEvalReport, runEvaluation, type EvalRunOptions } from "./eval-runner";

const DEFAULT_PASS_THRESHOLD = 0.7;

function parseEvalArgv(argv: string[]): EvalRunOptions {
  const opts: EvalRunOptions = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--category=")) {
      const v = a.slice("--category=".length);
      if (!v) throw new Error("--category= requires a non-empty value");
      opts.category = v;
      continue;
    }
    if (a === "--category") {
      const v = argv[++i];
      if (!v) throw new Error("--category requires a value (e.g. spec-query)");
      opts.category = v;
      continue;
    }
    if (a === "--trace") {
      const v = argv[++i];
      if (!v) throw new Error("--trace requires a trace id");
      opts.traceId = v;
      continue;
    }
    if (a.startsWith("--trace=")) {
      opts.traceId = a.slice("--trace=".length);
      continue;
    }
    if (a === "--evaluator") {
      const v = argv[++i];
      if (!v) throw new Error("--evaluator requires a name");
      opts.evaluatorName = v;
      continue;
    }
    if (a.startsWith("--evaluator=")) {
      opts.evaluatorName = a.slice("--evaluator=".length);
      continue;
    }
    if (a === "--code-only") {
      opts.codeOnly = true;
      continue;
    }
    if (a === "--help" || a === "-h") {
      console.log(`Usage: eval [options]

Options:
  --category <name>   Load datasets/<name>.json only
  --trace <traceId>   Load AITrace, spans, and agent answer from MongoDB
  --evaluator <name>  Run a single evaluator by name
  --code-only         Exclude llm-judge
  --help              Show this help

Env:
  EVAL_PASS_THRESHOLD   Minimum pass rate (0–1) to exit 0 (default: ${DEFAULT_PASS_THRESHOLD})
`);
      process.exit(0);
    }
    console.error(`Unknown argument: ${a}`);
    process.exit(2);
  }
  return opts;
}

function passThreshold(): number {
  const raw = process.env.EVAL_PASS_THRESHOLD;
  if (raw === undefined || raw === "") return DEFAULT_PASS_THRESHOLD;
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    console.error(`Invalid EVAL_PASS_THRESHOLD: ${raw}`);
    process.exit(2);
  }
  return n;
}

async function main() {
  try {
    const opts = parseEvalArgv(process.argv);
    const run = await runEvaluation(opts);
    const cols = await getMongoCollections();
    const results = await cols.evalResults.find({ runId: run.runId }).sort({ exampleId: 1, evaluator: 1 }).toArray();
    printEvalReport(run, results);
    const threshold = passThreshold();
    if (run.passRate < threshold) {
      console.error(`\nPass rate ${run.passRate.toFixed(3)} is below EVAL_PASS_THRESHOLD ${threshold}`);
      process.exit(1);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(msg);
    process.exit(1);
  }
}

await main();
