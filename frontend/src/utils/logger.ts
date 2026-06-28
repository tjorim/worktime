type LogMethod = (...args: unknown[]) => void;
type LogLevel = "debug" | "info" | "warn" | "error";

interface Logger {
  debug: LogMethod;
  info: LogMethod;
  warn: LogMethod;
  error: LogMethod;
}

const callInDev = (level: LogLevel): LogMethod => {
  return (...args) => {
    if (import.meta.env.DEV) {
      console[level](...args);
    }
  };
};

/* oxlint-disable no-console */
export const logger: Logger = {
  debug: callInDev("debug"),
  info: callInDev("info"),
  warn: (...args) => console.warn(...args),
  error: (...args) => console.error(...args),
};
