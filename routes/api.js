const express = require('express');
const router = express.Router();
const { priceService } = require('../services/priceService');
const parserService = require('../services/parserService');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');
const db = require('../db/database');

// Валидация имени площадки
const validateSite = (site) => {
  const availableParsers = parserService.getAvailableParsers().map(p => p.name);
  return availableParsers.includes(site);
};

// Валидация параметров запроса
const validateRequestParams = (params) => {
  const errors = [];
  
  if (!params.site1 || !params.site2) {
    errors.push('Параметры site1 и site2 обязательны');
  } else if (params.site1 === params.site2) {
    errors.push('Нельзя сравнивать одинаковые площадки');
  } else if (!validateSite(params.site1) || !validateSite(params.site2)) {
    errors.push('Указана неподдерживаемая площадка');
  }

  return errors;
};

/**
 * @swagger
 * /api/compare:
 *   get:
 *     summary: Сравнение цен между двумя площадками
 *     tags: [Prices]
 *     parameters:
 *       - in: query
 *         name: site1
 *         required: true
 *         description: Первая площадка для сравнения
 *         schema:
 *           type: string
 *       - in: query
 *         name: site2
 *         required: true
 *         description: Вторая площадка для сравнения
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Успешное сравнение цен
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 comparison:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/PriceComparison'
 *                 lastUpdate:
 *                   type: string
 *       400:
 *         description: Неверные параметры запроса
 *       500:
 *         description: Ошибка сервера
 */
router.get('/compare', async (req, res) => {
  try {
    const { site1, site2 } = req.query;

    // Валидация параметров
    const errors = validateRequestParams({ site1, site2 });
    if (errors.length > 0) {
      return res.status(400).json({ 
        error: errors.join(', '),
        availableParsers: parserService.getAvailableParsers()
      });
    }

    const comparison = await priceService.comparePrices(site1, site2);
    const lastUpdate = await priceService.getLastUpdateTime();

    res.json({ 
      success: true,
      comparison, 
      lastUpdate 
    });

  } catch (error) {
    logger.error('API Error:', error);
    res.status(500).json({ 
      error: 'Ошибка сервера',
      details: error.message
    });
  }
});


/**
 * @swagger
 * /api/parsers:
 *   get:
 *     summary: Получение списка доступных парсеров
 *     tags: [Parsers]
 *     responses:
 *       200:
 *         description: Список парсеров
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 parsers:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ParserInfo'
 *       500:
 *         description: Ошибка сервера
 */
router.get('/parsers', async (req, res) => {
  try {
    const parsers = parserService.getAvailableParsers();
    res.json({ 
      success: true,
      parsers 
    });
  } catch (error) {
    logger.error('Error getting parsers list:', error);
    res.status(500).json({ 
      error: 'Ошибка при получении списка парсеров',
      details: error.message
    });
  }
});

/**
 * @swagger
 * /api/profiles:
 *   get:
 *     summary: Получение списка профилей уведомлений
 *     tags: [Profiles]
 *     responses:
 *       200:
 *         description: Список профилей
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 profiles:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Profile'
 *       500:
 *         description: Ошибка сервера
 */
router.get('/profiles', async (req, res) => {
  try {
    const profiles = await priceService.getProfiles();
    res.json({ success: true, profiles });
  } catch (error) {
    logger.error('Error getting profiles:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/profiles:
 *   post:
 *     summary: Создание нового профиля уведомлений
 *     tags: [Profiles]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ProfileInput'
 *     responses:
 *       200:
 *         description: Профиль успешно создан
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 id:
 *                   type: integer
 *       400:
 *         description: Неверные данные профиля
 *       500:
 *         description: Ошибка сервера
 */
router.post('/profiles', async (req, res) => {
  try {
    const id = await priceService.createProfile(req.body);
    res.json({ success: true, id });
  } catch (error) {
    logger.error('Error creating profile:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/profiles/{id}:
 *   put:
 *     summary: Обновление профиля уведомлений
 *     tags: [Profiles]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID профиля
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ProfileInput'
 *     responses:
 *       200:
 *         description: Профиль успешно обновлен
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 changes:
 *                   type: integer
 *       400:
 *         description: Неверные данные профиля
 *       404:
 *         description: Профиль не найден
 *       500:
 *         description: Ошибка сервера
 */
router.put('/profiles/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Неверный ID профиля' });
    }

    const changes = await priceService.updateProfile(id, req.body);
    res.json({ success: true, changes });
  } catch (error) {
    logger.error('Error updating profile:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/profiles/{id}:
 *   delete:
 *     summary: Удаление профиля уведомлений
 *     tags: [Profiles]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID профиля
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Профиль успешно удален
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 changes:
 *                   type: integer
 *       400:
 *         description: Неверный ID профиля
 *       404:
 *         description: Профиль не найден
 *       500:
 *         description: Ошибка сервера
 */
router.delete('/profiles/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Неверный ID профиля' });
    }

    const changes = await priceService.deleteProfile(id);
    res.json({ success: true, changes });
  } catch (error) {
    logger.error('Error deleting profile:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/check-items:
 *   post:
 *     summary: Проверка новых выгодных предметов
 *     tags: [Prices]
 *     responses:
 *       200:
 *         description: Проверка завершена
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       500:
 *         description: Ошибка сервера
 */
router.post('/check-items', async (req, res) => {
  try {
    await priceService.checkForNewProfitableItems();
    res.json({ success: true });
  } catch (error) {
    logger.error('Error checking for new items:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/refresh:
 *   post:
 *     summary: Принудительное обновление данных
 *     tags: [Parsers]
 *     responses:
 *       200:
 *         description: Данные успешно обновлены
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 results:
 *                   type: object
 *                   additionalProperties:
 *                     $ref: '#/components/schemas/ParserResult'
 *       500:
 *         description: Ошибка обновления данных
 */
router.post('/refresh', async (req, res) => {
  try {
    const results = await parserService.parseAll();
    res.json({ 
      success: true,
      results 
    });
  } catch (error) {
    logger.error('Error refreshing data:', error);
    res.status(500).json({ 
      error: 'Ошибка обновления данных',
      details: error.message 
    });
  }
});

/**
 * @swagger
 * /api/parsers/status:
 *   get:
 *     summary: Получение статуса парсеров
 *     tags: [Parsers]
 *     responses:
 *       200:
 *         description: Статус парсеров
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 parsers:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ParserStatus'
 *       500:
 *         description: Ошибка сервера
 */
router.get('/parsers/status', async (req, res) => {
  try {
    const status = parserService.getParsersStatus();
    res.json({ 
      success: true,
      parsers: status 
    });
  } catch (error) {
    logger.error('Error getting parsers status:', error);
    res.status(500).json({ 
      error: 'Ошибка при получении статуса парсеров',
      details: error.message 
    });
  }
});

// Добавим в routes/api.js после существующих роутов

/**
 * @swagger
 * /api/all-prices:
 *   get:
 *     summary: Получить цены предмета на всех площадках
 *     tags: [Prices]
 *     parameters:
 *       - in: query
 *         name: item
 *         required: true
 *         description: Название предмета для поиска
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Цены на всех площадках
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 item:
 *                   type: string
 *                 prices:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ItemPrice'
 *       400:
 *         description: Не указано название предмета
 *       500:
 *         description: Ошибка сервера
 */
router.get('/all-prices', async (req, res) => {
    try {
        const { item } = req.query;
        
        if (!item || typeof item !== 'string') {
            return res.status(400).json({ 
                error: 'Необходимо указать название предмета' 
            });
        }

        const prices = await priceService.getItemPrices(item);
        
        res.json({ 
            success: true,
            item,
            prices 
        });
    } catch (error) {
        logger.error('API Error in /all-prices:', error);
        res.status(500).json({ 
            error: 'Ошибка при поиске цен',
            details: error.message
        });
    }
});

/**
 * @swagger
 * components:
 *   schemas:
 *     PriceComparison:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *           description: Название предмета
 *         price1:
 *           type: number
 *           format: float
 *           description: Цена на первой площадке ($)
 *         price2:
 *           type: number
 *           format: float
 *           description: Цена на второй площадке ($)
 *         price2AfterCommission:
 *           type: number
 *           format: float
 *           description: Цена на второй площадке после комиссии ($)
 *         profit:
 *           type: number
 *           format: float
 *           description: Абсолютная прибыль ($)
 *         profitPercent:
 *           type: number
 *           format: float
 *           description: Процент прибыли
 *         stock1:
 *           type: string
 *           description: Наличие на первой площадке
 *         stock2:
 *           type: string
 *           description: Наличие на второй площадке
 *         commission2:
 *           type: integer
 *           description: Комиссия второй площадки (%)
 *     ParserInfo:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *           description: Идентификатор парсера
 *         displayName:
 *           type: string
 *           description: Отображаемое имя
 *         lastUpdate:
 *           type: string
 *           format: date-time
 *           description: Время последнего обновления
 *         interval:
 *           type: string
 *           description: Интервал обновления
 *     Profile:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           description: ID профиля
 *         name:
 *           type: string
 *           description: Название профиля
 *         site1:
 *           type: string
 *           description: Первая площадка
 *         site2:
 *           type: string
 *           description: Вторая площадка
 *         minProfitPercent:
 *           type: number
 *           format: float
 *           description: Минимальный процент прибыли
 *         hideOverstock:
 *           type: boolean
 *           description: Скрывать перезапас
 *         isActive:
 *           type: boolean
 *           description: Профиль активен
 *         telegramEnabled:
 *           type: boolean
 *           description: Уведомления в Telegram включены
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: Дата создания
 *     ProfileInput:
 *       type: object
 *       required:
 *         - name
 *         - site1
 *         - site2
 *         - minProfitPercent
 *       properties:
 *         name:
 *           type: string
 *           description: Название профиля
 *         site1:
 *           type: string
 *           description: Первая площадка
 *         site2:
 *           type: string
 *           description: Вторая площадка
 *         minProfitPercent:
 *           type: number
 *           format: float
 *           description: Минимальный процент прибыли
 *         hideOverstock:
 *           type: boolean
 *           description: Скрывать перезапас
 *         isActive:
 *           type: boolean
 *           description: Профиль активен
 *         telegramEnabled:
 *           type: boolean
 *           description: Уведомления в Telegram включены
 *     ItemPrice:
 *       type: object
 *       properties:
 *         source:
 *           type: string
 *           description: Площадка
 *         price:
 *           type: number
 *           format: float
 *           description: Цена ($)
 *         priceAfterCommission:
 *           type: number
 *           format: float
 *           description: Цена после комиссии ($)
 *         stock:
 *           type: string
 *           description: Наличие
 *         timestamp:
 *           type: string
 *           format: date-time
 *           description: Время обновления
 *     ParserResult:
 *       type: object
 *       properties:
 *         count:
 *           type: integer
 *           description: Количество обработанных предметов
 *         error:
 *           type: string
 *           description: Сообщение об ошибке
 *     ParserStatus:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *           description: Идентификатор парсера
 *         displayName:
 *           type: string
 *           description: Отображаемое имя
 *         status:
 *           type: string
 *           enum: [Active, Inactive, Error, Updating]
 *           description: Текущий статус
 *         lastUpdate:
 *           type: string
 *           format: date-time
 *           description: Время последнего обновления
 *         itemsCount:
 *           type: integer
 *           description: Количество предметов
 *         lastError:
 *           type: string
 *           description: Последняя ошибка
 *         interval:
 *           type: integer
 *           description: Интервал обновления (мс)
 */

module.exports = router;