const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const parserService = require('./services/parserService');
const { priceService } = require('./services/priceService');


// Инициализация приложения
const app = express();

// После запуска сервера
setInterval(() => {
    priceService.checkForNewProfitableItems();
}, 5 * 60 * 100); // Проверка каждые 5 минут

// Конфигурация лимитера запросов
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 1000 // лимит запросов
});

// Настройка CORS
const corsOptions = {
  origin: true,
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  allowedHeaders: ['Content-Type'],
  exposedHeaders: ['Content-Type']
};

// Middleware
app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(cors(corsOptions));
app.use(limiter);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Кастомные заголовки безопасности
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Статические файлы с правильными MIME-типами
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    // CSS и JavaScript
    if (filePath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    }
    if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    }
    
    // Шрифты
    if (filePath.endsWith('.woff2')) {
      res.setHeader('Content-Type', 'font/woff2');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
    if (filePath.endsWith('.woff')) {
      res.setHeader('Content-Type', 'font/woff');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
    if (filePath.endsWith('.ttf')) {
      res.setHeader('Content-Type', 'font/ttf');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
    if (filePath.endsWith('.eot')) {
      res.setHeader('Content-Type', 'application/vnd.ms-fontobject');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
    if (filePath.endsWith('.svg')) {
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
    
    // Разрешаем CORS для шрифтов
    if (filePath.includes('webfonts')) {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
  }
}));

// Content Security Policy
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline'; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' data:; " +
    "img-src 'self' data:; " +
    "connect-src 'self'; " +
    "frame-src 'none'; " +
    "object-src 'none'"
  );
  next();
});

// API Routes (должно быть ДО SPA fallback)
app.use('/api', require('./routes/api'));

// SPA Fallback (должно быть ПОСЛЕ всех API роутов)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Обработка 404 для API
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// Обработка ошибок
app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    
    try {
        await parserService.startAutoUpdate();
    } catch (error) {
        console.error('Auto-update error:', error);
    }
});

// Graceful shutdown
['SIGINT', 'SIGTERM'].forEach(signal => {
  process.on(signal, () => {
    console.log(`Received ${signal}, shutting down...`);
    parserService.stopAutoUpdate();
    server.close(() => {
      console.log('Server stopped');
      process.exit(0);
    });
  });
});

module.exports = server;