const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { setTimeout } = require('timers/promises');

// Пути к базам данных
const DB_MAIN_PATH = path.join(__dirname, 'prices.db');
const DB_PARSERS_DIR = path.join(__dirname, 'parsers');
const DB_MIGRATIONS_DIR = path.join(__dirname, 'migrations');

// Создаем директории, если их нет
if (!fs.existsSync(DB_PARSERS_DIR)) {
  fs.mkdirSync(DB_PARSERS_DIR, { recursive: true });
}
if (!fs.existsSync(DB_MIGRATIONS_DIR)) {
  fs.mkdirSync(DB_MIGRATIONS_DIR, { recursive: true });
}

// Главная база данных
const mainDb = new sqlite3.Database(DB_MAIN_PATH, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
  if (err) {
    console.error('Main DB connection error:', err);
    process.exit(1);
  }
  console.log('Connected to main SQLite database');
});

// Методы для работы с базой данных
const dbMethods = {
  runAsync: (db, sql, params = []) => {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve(this);
      });
    });
  },

  getAsync: (db, sql, params = []) => {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  },

  allAsync: (db, sql, params = []) => {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  },

  execAsync: (db, sql) => {
    return new Promise((resolve, reject) => {
      db.exec(sql, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  },

  runInTransaction: async (db, operations) => {
    return new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        operations.forEach(({ sql, params }, index) => {
          db.run(sql, params, function(err) {
            if (err) {
              db.run('ROLLBACK');
              return reject(err);
            }

            if (index === operations.length - 1) {
              db.run('COMMIT', (commitErr) => {
                if (commitErr) {
                  db.run('ROLLBACK');
                  reject(commitErr);
                } else {
                  resolve();
                }
              });
            }
          });
        });
      });
    });
  }
};

// Инициализация главной базы
async function initializeMainDatabase() {
  try {
    // Настройки базы данных
    await dbMethods.runAsync(mainDb, `
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA busy_timeout = 5000;
      PRAGMA foreign_keys = ON;
    `);

    // Таблица профилей
    await dbMethods.runAsync(mainDb, `
      CREATE TABLE IF NOT EXISTS profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        site1 TEXT NOT NULL,
        site2 TEXT NOT NULL,
        minProfitPercent REAL NOT NULL,
        hideOverstock INTEGER DEFAULT 0,
        isActive INTEGER DEFAULT 1,
        telegramEnabled INTEGER DEFAULT 0,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(name) ON CONFLICT REPLACE
      )
    `);

    // Таблица логов уведомлений
    await dbMethods.runAsync(mainDb, `
      CREATE TABLE IF NOT EXISTS notification_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        profile_id INTEGER,
        item_name TEXT NOT NULL,
        profit_percent REAL NOT NULL,
        was_unavailable INTEGER DEFAULT 0,
        timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(profile_id) REFERENCES profiles(id) ON DELETE SET NULL
      )
    `);

    // Таблица для хранения данных парсеров
    await dbMethods.runAsync(mainDb, `
      CREATE TABLE IF NOT EXISTS items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT NOT NULL,
        name TEXT NOT NULL,
        price INTEGER NOT NULL,
        stock TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        UNIQUE(source, name) ON CONFLICT REPLACE
      )
    `);

    // Индексы для ускорения поиска
    await dbMethods.runAsync(mainDb, 'CREATE INDEX IF NOT EXISTS idx_items_source ON items(source)');
    await dbMethods.runAsync(mainDb, 'CREATE INDEX IF NOT EXISTS idx_items_name ON items(name)');
    await dbMethods.runAsync(mainDb, 'CREATE INDEX IF NOT EXISTS idx_items_timestamp ON items(timestamp)');

    console.log('Main database initialized successfully');
  } catch (error) {
    console.error('Error initializing main database:', error);
    throw error;
  }
}

// Получение соединения с базой парсера
function getParserDatabase(parserName) {
  const dbPath = path.join(DB_PARSERS_DIR, `${parserName}.db`);
  
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, '');
    console.log(`Created new database for parser: ${parserName}`);
  }

  return new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
    if (err) {
      console.error(`Error connecting to ${parserName} database:`, err);
    }
  });
}

// Инициализация базы парсера
async function initializeParserDatabase(parserName) {
  const db = getParserDatabase(parserName);
  
  try {
    // Настройки базы данных
    await dbMethods.runAsync(db, `
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA busy_timeout = 5000;
    `);

    // Таблица предметов
    await dbMethods.runAsync(db, `
      CREATE TABLE IF NOT EXISTS items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        price INTEGER NOT NULL,
        stock TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        UNIQUE(name) ON CONFLICT REPLACE
      )
    `);

    // Таблица статуса парсера
    await dbMethods.runAsync(db, `
      CREATE TABLE IF NOT EXISTS parser_status (
        last_update TEXT NOT NULL,
        items_count INTEGER NOT NULL,
        error TEXT
      )
    `);

    // Индексы для ускорения поиска
    await dbMethods.runAsync(db, 'CREATE INDEX IF NOT EXISTS idx_items_name ON items(name)');
    await dbMethods.runAsync(db, 'CREATE INDEX IF NOT EXISTS idx_items_timestamp ON items(timestamp)');

    console.log(`Parser database initialized: ${parserName}`);
    return db;
  } catch (error) {
    console.error(`Error initializing parser database (${parserName}):`, error);
    throw error;
  }
}

// Применение миграций
async function applyMigrations(db, migrationsDir) {
  try {
    if (!fs.existsSync(migrationsDir)) {
      console.log('Migrations directory does not exist, skipping');
      return;
    }

    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();

    // Создаем таблицу для отслеживания выполненных миграций
    await dbMethods.runAsync(db, `
      CREATE TABLE IF NOT EXISTS migrations (
        name TEXT PRIMARY KEY,
        executed_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    for (const file of migrationFiles) {
      // Проверяем, выполнена ли уже эта миграция
      const migrationExecuted = await dbMethods.getAsync(db, 
        'SELECT name FROM migrations WHERE name = ?', [file]);
      
      if (migrationExecuted) {
        console.log(`Migration already applied: ${file}`);
        continue;
      }

      const migrationPath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(migrationPath, 'utf8');

      try {
        await dbMethods.execAsync(db, sql);
        await dbMethods.runAsync(db, 
          'INSERT INTO migrations (name) VALUES (?)', [file]);
        console.log(`Applied migration: ${file}`);
      } catch (err) {
        console.error(`Failed to apply migration ${file}:`, err);
        throw err;
      }
    }
  } catch (error) {
    console.error('Error applying migrations:', error);
    throw error;
  }
}

// Закрытие соединений при завершении
process.on('SIGINT', () => {
  mainDb.close((err) => {
    if (err) console.error('Error closing main database:', err);
    else console.log('Main database connection closed');
  });
  process.exit(0);
});

// Инициализация главной базы при запуске
initializeMainDatabase().catch(err => {
  console.error('Failed to initialize main database:', err);
  process.exit(1);
});

// Экспорт
module.exports = {
    mainDb,
    DB_MAIN_PATH,
    DB_PARSERS_DIR,  // Добавляем экспорт
    DB_MIGRATIONS_DIR,
    initializeMainDatabase,
    getParserDatabase,
    initializeParserDatabase,
    applyMigrations,
    ...dbMethods
};