import pino from "pino";

const level = (process.env.LOG_LEVEL ?? "info").trim() || "info";

const base = pino({
  level
});

export function createLogger(module: string): pino.Logger {
  return base.child({ module });
}
