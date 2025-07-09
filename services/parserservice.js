const fs = require('fs');
const path = require('path');
const { Worker } = require('worker_threads');
const { 
  getParserDatabase, 
  initializeParserDatabase,
  runAsync,
  getAsync,
  allAsync,
  runInTransaction
} = require('../db/database');
const logger = require('../utils/logger');
const { priceService } = require('./priceService');

class ParserService {
  constructor() {
    this.parsers = {};
    this.workers = {};
    this.parserConfig = {
      intervals: {
        'rustmagic': 5 * 60 * 100, // 5 минут
        'lootfarm': 5 * 60 * 100, // 10 минут
        'default': 5 * 60 * 100 // 30 минут
      },
      retries: 3,
      retryDelay: 5000
    };
    this.status = {};
  }

  /**
   * Инициализация сервиса парсеров
   */
  async init() {
  try {
    // Добавляем проверку на уже инициализированные парсеры
    if (Object.keys(this.parsers).length > 0) {
      logger.info('Parsers already loaded, skipping reinitialization');
      return;
    }
    
    await this.loadParsers();
    await this.initializeAllParserDatabases();
    logger.info('ParserService initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize ParserService:', error);
    throw error;
  }
}

  /**
   * Загрузка всех парсеров из директории parsers
   */
  async loadParsers() {
    return new Promise((resolve, reject) => {
      try {
        const parsersDir = path.join(__dirname, '../parsers');
        
        if (!fs.existsSync(parsersDir)) {
          throw new Error(`Parsers directory not found: ${parsersDir}`);
        }

        const parserFiles = fs.readdirSync(parsersDir)
          .filter(file => file.endsWith('.js') && !file.startsWith('_'));

        if (parserFiles.length === 0) {
          logger.warn('No parser files found in directory');
          return resolve();
        }

        parserFiles.forEach(file => {
          try {
            const parserName = path.basename(file, '.js');
            const parserPath = path.join(parsersDir, file);
            
            // Удаляем кэш модуля перед загрузкой
            delete require.cache[require.resolve(parserPath)];
            
            const parser = require(parserPath);
            if (parser && typeof parser.parse === 'function') {
              this.parsers[parserName] = parser;
              this.status[parserName] = {
                lastUpdate: null,
                lastError: null,
                isActive: false
              };
              logger.info(`Loaded parser: ${parserName}`);
            }
          } catch (error) {
            logger.error(`Error loading parser ${file}:`, error);
          }
        });

        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Инициализация баз данных для всех парсеров
   */
  async initializeAllParserDatabases() {
    for (const parserName of Object.keys(this.parsers)) {
      try {
        await initializeParserDatabase(parserName);
        logger.info(`Initialized database for parser: ${parserName}`);
      } catch (error) {
        logger.error(`Failed to initialize database for ${parserName}:`, error);
      }
    }
  }

  /**
   * Запуск автоматического обновления для всех парсеров
   */
  async startAutoUpdate() {
    this.stopAutoUpdate();

    for (const parserName of Object.keys(this.parsers)) {
      this.startParserWorker(parserName);
    }

    logger.info('Started auto-update for all parsers');
  }

  /**
   * Остановка автоматического обновления
   */
  stopAutoUpdate() {
    for (const [parserName, worker] of Object.entries(this.workers)) {
      worker.terminate();
      this.status[parserName].isActive = false;
    }
    this.workers = {};
    logger.info('Stopped all parser workers');
  }

  /**
   * Запуск worker-а для конкретного парсера
   */
  startParserWorker(parserName) {
    if (!this.parsers[parserName]) {
      logger.error(`Parser not found: ${parserName}`);
      return;
    }

    if (this.workers[parserName]) {
      logger.warn(`Parser worker already running: ${parserName}`);
      return;
    }

    const worker = new Worker(path.join(__dirname, 'parserWorker.js'), { 
      workerData: { 
        parserName,
        config: this.parserConfig 
      }
    });

    this.workers[parserName] = worker;
    this.status[parserName].isActive = true;

    worker.on('message', (message) => {
      this.handleWorkerMessage(parserName, message);
    });

    worker.on('error', (error) => {
      logger.error(`Parser worker error (${parserName}):`, error);
      this.status[parserName].lastError = error.message;
    });

    worker.on('exit', (code) => {
      if (code !== 0) {
        logger.error(`Parser worker stopped (${parserName}) with exit code ${code}`);
      }
      delete this.workers[parserName];
      this.status[parserName].isActive = false;
    });

    logger.info(`Started worker for parser: ${parserName}`);
  }

  /**
   * Обработка сообщений от worker-ов
   */
  handleWorkerMessage(parserName, message) {
    switch (message.type) {
      case 'update':
        this.status[parserName].lastUpdate = new Date();
        this.status[parserName].itemsCount = message.itemsCount;
        this.status[parserName].lastError = null;
        logger.info(`Parser ${parserName} updated successfully (${message.itemsCount} items)`);
        break;
      
      case 'error':
        this.status[parserName].lastError = message.error;
        logger.error(`Parser ${parserName} error:`, message.error);
        break;
      
      case 'status':
        this.status[parserName].isActive = message.isActive;
        break;
      
      default:
        logger.warn(`Unknown message type from parser ${parserName}:`, message);
    }
  }

  /**
   * Принудительное обновление данных для всех парсеров
   */
  async parseAll() {
    const results = {};
    
    for (const parserName of Object.keys(this.parsers)) {
      try {
        results[parserName] = await this.parseSingle(parserName);
      } catch (error) {
        results[parserName] = { error: error.message };
        logger.error(`Error parsing ${parserName}:`, error);
      }
    }

    return results;
  }

  /**
   * Обновление данных для одного парсера
   */
  async parseSingle(parserName) {
    if (!this.parsers[parserName]) {
      throw new Error(`Parser not found: ${parserName}`);
    }

    const parser = this.parsers[parserName];
    const db = getParserDatabase(parserName);

    try {
      // Парсинг данных с повторными попытками
      const items = await this.withRetry(
        () => parser.parse(),
        this.parserConfig.retries,
        this.parserConfig.retryDelay
      );

      // Сохранение в базу данных
      const savedCount = await this.saveItemsToDatabase(db, parserName, items);

      // Обновление статуса
      this.status[parserName] = {
        lastUpdate: new Date(),
        itemsCount: savedCount,
        lastError: null,
        isActive: true
      };

      // Проверка выгодных предложений
      await priceService.checkForNewProfitableItems();

      return { count: savedCount };
    } catch (error) {
      this.status[parserName].lastError = error.message;
      throw error;
    }
  }

  /**
   * Сохранение данных в базу парсера
   */
  async saveItemsToDatabase(db, parserName, items) {
    try {
      const operations = [
        { sql: 'DELETE FROM items' },
        ...items.map(item => ({
          sql: 'INSERT INTO items (name, price, stock, timestamp) VALUES (?, ?, ?, ?)',
          params: [item.name, item.price, item.stock, new Date().toISOString()]
        }))
      ];

      await runInTransaction(db, operations);

      // Сохраняем статус обновления
      await runAsync(db, `
        INSERT INTO parser_status (last_update, items_count, error)
        VALUES (?, ?, ?)
        ON CONFLICT DO UPDATE SET
          last_update = excluded.last_update,
          items_count = excluded.items_count,
          error = excluded.error
      `, [new Date().toISOString(), items.length, null]);

      return items.length;
    } catch (error) {
      // В случае ошибки сохраняем информацию о ней
      await runAsync(db, `
        INSERT INTO parser_status (last_update, items_count, error)
        VALUES (?, ?, ?)
        ON CONFLICT DO UPDATE SET
          last_update = excluded.last_update,
          error = excluded.error
      `, [new Date().toISOString(), 0, error.message]);

      throw error;
    }
  }

  /**
   * Попытка выполнения с повторными попытками
   */
  async withRetry(fn, retries, delay) {
    let lastError;
    
    for (let i = 0; i < retries; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        if (i < retries - 1) {
          logger.warn(`Attempt ${i + 1}/${retries} failed, retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Получение списка доступных парсеров
   */
  getAvailableParsers() {
    return Object.keys(this.parsers).map(name => ({
      name,
      displayName: this.formatParserName(name),
      ...this.status[name]
    }));
  }

  /**
   * Получение статуса парсеров
   */
  getParsersStatus() {
    return Object.entries(this.parsers).map(([name, parser]) => ({
      name,
      displayName: this.formatParserName(name),
      status: this.status[name].isActive ? 
        (this.status[name].lastError ? 'Error' : 'Active') : 'Inactive',
      lastUpdate: this.status[name].lastUpdate,
      itemsCount: this.status[name].itemsCount,
      lastError: this.status[name].lastError,
      interval: this.parserConfig.intervals[name] || this.parserConfig.intervals.default
    }));
  }

  /**
   * Форматирование имени парсера
   */
  formatParserName(parserName) {
    const nameMap = {
      'rustmagic': 'RustMagic',
      'lootfarm': 'LootFarm',
      'cstrade': 'CS.Trade',
      'tradeit': 'TradeIt.gg',
      'itrade': 'ITrade.gg',
      'swapgg': 'Swap.gg',
      'rusttm': 'Rust.TM',
      'skinswap': 'Skinswap',
      'rustreaper': 'RustReaper',
      'rustbet': 'RustBet',
      'rustclash': 'RustClash',
      'lis-skins': 'LIS Skins',
      'bandit.camp': 'Bandit Camp'
    };
    
    return nameMap[parserName] || parserName;
  }

  /**
   * Получение предметов из базы парсера
   */
  async getItemsFromParser(parserName, itemName = '') {
    if (!this.parsers[parserName]) {
      throw new Error(`Parser not found: ${parserName}`);
    }

    const db = getParserDatabase(parserName);
    return allAsync(db, `
      SELECT name, price, stock, timestamp 
      FROM items 
      WHERE name LIKE ?
      ORDER BY name
    `, [`%${itemName}%`]);
  }
}

// Создаем и экспортируем экземпляр сервиса
const parserService = new ParserService();

// Инициализация при старте
parserService.init()
  .catch(error => {
    logger.error('Failed to initialize ParserService:', error);
    process.exit(1);
  });

module.exports = parserService;