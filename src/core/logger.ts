/**
 * Logger - 可注入的日志系统
 *
 * 库默认静默，由使用方决定输出方式与级别。
 */

/**
 * 日志级别
 */
export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'SILENT';

/**
 * 日志级别优先级映射
 */
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  SILENT: 4,
};

/**
 * Logger 接口
 */
export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

/**
 * 控制台日志实现
 */
export class ConsoleLogger implements Logger {
  private readonly level: LogLevel;

  constructor(level: LogLevel = 'INFO') {
    this.level = level;
  }

  private shouldLog(targetLevel: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[targetLevel] >= LOG_LEVEL_PRIORITY[this.level];
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.shouldLog('DEBUG')) {
      console.debug(`[DEBUG] ${message}`, ...args);
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (this.shouldLog('INFO')) {
      console.info(`[INFO] ${message}`, ...args);
    }
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.shouldLog('WARN')) {
      console.warn(`[WARN] ${message}`, ...args);
    }
  }

  error(message: string, ...args: unknown[]): void {
    if (this.shouldLog('ERROR')) {
      console.error(`[ERROR] ${message}`, ...args);
    }
  }
}

/**
 * 静默日志实现（不输出任何内容）
 */
export class SilentLogger implements Logger {
  debug(_message: string, ..._args: unknown[]): void {
    // 静默
  }

  info(_message: string, ..._args: unknown[]): void {
    // 静默
  }

  warn(_message: string, ..._args: unknown[]): void {
    // 静默
  }

  error(_message: string, ..._args: unknown[]): void {
    // 静默
  }
}

/**
 * 默认的静默 Logger 实例
 */
export const silentLogger = new SilentLogger();

/**
 * 根据日志级别创建 Logger
 */
export function createLogger(level: LogLevel = 'SILENT'): Logger {
  if (level === 'SILENT') {
    return silentLogger;
  }
  return new ConsoleLogger(level);
}

/**
 * 全局默认 Logger（静默）
 * 可通过 setDefaultLogger 替换
 */
let defaultLogger: Logger = silentLogger;

/**
 * 获取默认 Logger
 */
export function getDefaultLogger(): Logger {
  return defaultLogger;
}

/**
 * 设置默认 Logger
 */
export function setDefaultLogger(logger: Logger): void {
  defaultLogger = logger;
}
