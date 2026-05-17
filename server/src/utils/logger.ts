type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const envLevel = (process.env.LOG_LEVEL || 'info').toLowerCase() as LogLevel;
const minPriority = LEVEL_PRIORITY[envLevel] ?? LEVEL_PRIORITY.info;
const useJson = (process.env.LOG_FORMAT || '').toLowerCase() === 'json';

function serializeMeta(meta: unknown): string {
  if (meta === undefined) return '';
  if (meta instanceof Error) {
    return ` ${meta.stack || `${meta.name}: ${meta.message}`}`;
  }
  try {
    return ` ${JSON.stringify(meta)}`;
  } catch {
    return ` ${String(meta)}`;
  }
}

function format(level: LogLevel, message: string, meta?: unknown): string {
  const time = new Date().toISOString();
  if (useJson) {
    const payload: Record<string, unknown> = { time, level, message };
    if (meta !== undefined) {
      payload.meta = meta instanceof Error
        ? { name: meta.name, message: meta.message, stack: meta.stack }
        : meta;
    }
    try {
      return JSON.stringify(payload);
    } catch {
      return JSON.stringify({ time, level, message, meta: String(meta) });
    }
  }
  return `[${time}] [${level.toUpperCase()}] ${message}${serializeMeta(meta)}`;
}

function emit(level: LogLevel, message: string, meta?: unknown): void {
  if (LEVEL_PRIORITY[level] < minPriority) return;
  const line = format(level, message, meta);
  if (level === 'error' || level === 'warn') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

export const logger = {
  debug: (message: string, meta?: unknown) => emit('debug', message, meta),
  info: (message: string, meta?: unknown) => emit('info', message, meta),
  warn: (message: string, meta?: unknown) => emit('warn', message, meta),
  error: (message: string, meta?: unknown) => emit('error', message, meta),
};
