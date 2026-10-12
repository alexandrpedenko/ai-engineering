import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export type Logger = {
  info(message: string, fields?: Record<string, unknown>): void;
  error(message: string, error: unknown, fields?: Record<string, unknown>): void;
};

// One JSON object per line: time, level, message, and any fields. Errors add
// their message and stack.
export function logLine(level: "info" | "error", message: string, fields: Record<string, unknown>, now: Date): string {
  return `${JSON.stringify({ time: now.toISOString(), level, message, ...fields })}\n`;
}

function errorFields(error: unknown): Record<string, unknown> {
  return error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) };
}

// A logger that writes each line to standard error and appends it to
// <dataDir>/logs/server.log. Writing the file is best effort: if it fails,
// the line is still on standard error.
export function createLogger(dataDir: string, write: (line: string) => void = (line) => process.stderr.write(line), now = () => new Date()): Logger {
  const file = join(dataDir, "logs", "server.log");
  const emit = (level: "info" | "error", message: string, fields: Record<string, unknown>) => {
    const line = logLine(level, message, fields, now());
    write(line);
    try {
      mkdirSync(join(dataDir, "logs"), { recursive: true });
      appendFileSync(file, line);
    } catch (error) {
      write(logLine("error", "couldn't write the log file", errorFields(error), now()));
    }
  };
  return {
    info: (message, fields = {}) => emit("info", message, fields),
    error: (message, error, fields = {}) => emit("error", message, { ...fields, ...errorFields(error) }),
  };
}
