type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function currentLevel(): LogLevel {
  const level = process.env.LOG_LEVEL;
  if (level === "debug" || level === "info" || level === "warn" || level === "error") {
    return level;
  }
  return "info";
}

function shouldLog(level: LogLevel): boolean {
  return LEVELS[level] >= LEVELS[currentLevel()];
}

function write(level: LogLevel, message: string, data?: Record<string, unknown>) {
  if (!shouldLog(level)) return;
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...data,
  };
  console.log(JSON.stringify(entry));
}

export const logger = {
  debug: (message: string, data?: Record<string, unknown>) => write("debug", message, data),
  info: (message: string, data?: Record<string, unknown>) => write("info", message, data),
  warn: (message: string, data?: Record<string, unknown>) => write("warn", message, data),
  error: (message: string, data?: Record<string, unknown>) => write("error", message, data),
};
