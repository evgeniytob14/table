const fs = require('fs');
const path = require('path');
const { createLogger, format, transports } = require('winston');
const { inspect } = require('util');

// ==================== Логгер ====================
const logger = createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    format.splat(),
    format.json()
  ),
  transports: [
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.printf(({ level, message, timestamp, stack }) => {
          let msg = `${timestamp} [${level}]: ${message}`;
          if (stack) msg += `\n${stack}`;
          return msg;
        })
      )
    }),
    new transports.File({ 
      filename: path.join(__dirname, '../logs/error.log'), 
      level: 'error',
      format: format.combine(
        format.timestamp(),
        format.json()
      )
    }),
    new transports.File({ 
      filename: path.join(__dirname, '../logs/combined.log'),
      format: format.combine(
        format.timestamp(),
        format.json()
      )
    })
  ],
  exceptionHandlers: [
    new transports.File({ 
      filename: path.join(__dirname, '../logs/exceptions.log') 
    })
  ]
});

// ==================== Обработка ошибок ====================
class AppError extends Error {
  constructor(message, statusCode = 500, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

const handleError = (err, req, res) => {
  logger.error(`${err.statusCode || 500} - ${err.message} - ${req.originalUrl} - ${req.method} - ${req.ip}`);
  
  if (process.env.NODE_ENV !== 'production') {
    logger.error(err.stack);
  }

  res.status(err.statusCode || 500).json({
    status: 'error',
    message: err.message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
    ...(err.details && { details: err.details })
  });
};

// ==================== Валидация ====================
const validateInput = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.body, {
    abortEarly: false,
    allowUnknown: true,
    stripUnknown: true
  });

  if (error) {
    const errors = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message
    }));
    throw new AppError('Validation failed', 400, { errors });
  }

  req.validatedData = value;
  next();
};

// ==================== Вспомогательные функции ====================
const deepClone = (obj) => JSON.parse(JSON.stringify(obj));

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const ensureDirExists = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

const formatSiteName = (site) => {
  const siteNames = {
    'rustmagic': 'RustMagic',
    'lootfarm': 'LootFarm',
    'cstrade': 'CS.Trade',
    'tradeit': 'TradeIt',
    'itrade': 'ITrade',
    'swapgg': 'Swap.gg',
    'rusttm': 'Rust.TM',
    'skinswap': 'Skinswap',
    'rustreaper': 'RustReaper',
    'rustbet': 'RustBet',
    'rustclash': 'RustClash'
  };
  return siteNames[site] || site;
};

const formatPrice = (price) => {
  if (typeof price !== 'number') return '$0.00';
  return `$${(price / 100).toFixed(2)}`;
};

const inspectObject = (obj, depth = 5) => {
  return inspect(obj, { depth, colors: true });
};

// ==================== Экспорт ====================
module.exports = {
  logger,
  AppError,
  handleError,
  validateInput,
  deepClone,
  sleep,
  ensureDirExists,
  formatSiteName,
  formatPrice,
  inspectObject
};