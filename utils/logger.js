const { createLogger, format, transports } = require('winston');
const { combine, timestamp, printf, colorize, json, errors } = format;
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');

// Создаем директорию для логов, если ее нет
const logDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Кастомный формат для консоли
const consoleFormat = printf(({ level, message, timestamp, stack }) => {
  let log = `${timestamp} [${level}]: ${message}`;
  if (stack) {
    log += `\n${stack}`;
  }
  return log;
});

// Кастомный формат для файлов
const fileFormat = printf(({ level, message, timestamp, stack, ...metadata }) => {
  let log = {
    timestamp,
    level,
    message,
    ...metadata
  };
  if (stack) {
    log.stack = stack;
  }
  return JSON.stringify(log);
});

// Транспорты для production
const productionTransports = [
  new DailyRotateFile({
    filename: path.join(logDir, 'application-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '30d',
    format: combine(
      timestamp(),
      errors({ stack: true }),
      fileFormat
    )
  }),
  new DailyRotateFile({
    filename: path.join(logDir, 'error-%DATE%.log'),
    level: 'error',
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '90d',
    format: combine(
      timestamp(),
      errors({ stack: true }),
      fileFormat
    )
  })
];

// Транспорты для development
const developmentTransports = [
  new transports.Console({
    format: combine(
      colorize(),
      timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      errors({ stack: true }),
      consoleFormat
    )
  }),
  new transports.File({
    filename: path.join(logDir, 'dev-combined.log'),
    format: combine(
      timestamp(),
      errors({ stack: true }),
      json()
    )
  })
];

// Создаем логгер
const logger = createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  exitOnError: false,
  handleExceptions: true,
  handleRejections: true,
  transports: process.env.NODE_ENV === 'production' 
    ? productionTransports 
    : developmentTransports
});

// Для обработки необработанных исключений
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// Для обработки необработанных promise rejection
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Расширяем логгер дополнительными методами
logger.stream = {
  write: (message) => {
    logger.info(message.trim());
  }
};

// Метод для логирования HTTP запросов
logger.httpMiddleware = function(req, res, next) {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.http(`${req.method} ${req.originalUrl}`, {
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      params: req.params,
      query: req.query,
      body: req.body
    });
  });

  next();
};

module.exports = logger;