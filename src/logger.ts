/**
 * Tiny structured logger.
 *
 * The Python backend emitted one JSON object per line; keeping that shape
 * means existing log queries and dashboards keep working after the port.
 * `wrangler tail` renders these as-is.
 */

type Level = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
  child(scope: string): Logger;
}

function emit(level: Level, scope: string, msg: string, fields?: Record<string, unknown>): void {
  const line = JSON.stringify({
    level,
    time: new Date().toISOString(),
    scope,
    msg,
    ...(fields ?? {}),
  });
  // warn/error go to stderr so a log drain can separate them.
  if (level === "error" || level === "warn") {
    console.error(line);
  } else {
    console.log(line);
  }
}

export function getLogger(scope: string): Logger {
  return {
    debug: (m, f) => emit("debug", scope, m, f),
    info: (m, f) => emit("info", scope, m, f),
    warn: (m, f) => emit("warn", scope, m, f),
    error: (m, f) => emit("error", scope, m, f),
    child: (sub: string) => getLogger(`${scope}:${sub}`),
  };
}
