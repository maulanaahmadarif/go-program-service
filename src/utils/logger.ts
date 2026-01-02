import pino from 'pino';

// Determine if we're in development mode
const isDevelopment = process.env.NODE_ENV !== 'production';

// Create logger configuration
const loggerConfig: pino.LoggerOptions = {
  level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
};

// Create logger instance
// In development, use pino-pretty for human-readable output
// In production, use standard JSON output
const logger = isDevelopment
  ? pino(
      loggerConfig,
      pino.transport({
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      })
    )
  : pino(loggerConfig);

export default logger;

