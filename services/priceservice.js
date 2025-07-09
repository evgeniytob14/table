const db = require('../db/database');
const TelegramService = require('./telegramService');
const logger = require('../utils/logger');
const { formatSiteName } = require('./utils');
const fs = require('fs');
const path = require('path');

class PriceService {
    static COMMISSIONS = {
        'lootfarm': 3,
        'rustmagic': 10,
        'cstrade': 5,
        'tradeit': 10,
        'itrade': 5,
        'swapgg': 5,
        'rusttm': 5,
        'skinswap': 5,
        'rustreaper': 5,
        'rustbet': 5,
        'rustclash': 5,
        'rustyloot': 5,
        'rusttm_buy_orders': 5
    };

    /**
     * Рассчитывает цену после комиссии
     * @param {number} price - Исходная цена в центах
     * @param {string} source - Источник (площадка)
     * @returns {number} Цена после вычета комиссии
     */
    static calculateAfterCommission(price, source) {
        if (typeof price !== 'number' || isNaN(price)) {
            throw new Error('Invalid price value');
        }
        const commission = this.COMMISSIONS[source] || 0;
        return Math.round(price * (100 - commission)) / 100;
    }

    /**
     * Рассчитывает прибыль между двумя ценами
     * @param {number} price1 - Цена на первой площадке (в центах)
     * @param {number} price2 - Цена на второй площадке (в центах)
     * @param {string} source2 - Вторая площадка (для расчета комиссии)
     * @returns {object} Объект с расчетами прибыли
     */
    static calculateProfit(price1, price2, source2) {
        if (typeof price1 !== 'number' || typeof price2 !== 'number' || isNaN(price1) || isNaN(price2)) {
            throw new Error('Invalid price values');
        }
        const commission = this.COMMISSIONS[source2] || 0;
        const price2AfterCommission = Math.round(price2 * (100 - commission)) / 100;
        
        const profit = (price2AfterCommission - price1) / 100;
        const basis = Math.max(price1, price2AfterCommission);
        const profitPercent = basis !== 0 ? (profit / (basis / 100)) * 100 : 0;

        return {
            profit: parseFloat(profit.toFixed(2)),
            profitPercent: parseFloat(profitPercent.toFixed(2)),
            price2AfterCommission: price2AfterCommission / 100
        };
    }

    /**
     * Получает список всех доступных площадок
     * @returns {Promise<Array>} Массив с названиями площадок
     */
    async getAvailableSources() {
        try {
            // Получаем список всех файлов баз данных парсеров
            const parserFiles = fs.readdirSync(db.DB_PARSERS_DIR)
                .filter(file => file.endsWith('.db'))
                .map(file => file.replace('.db', ''));
            
            return parserFiles;
        } catch (error) {
            logger.error('Error getting available sources:', error);
            return [];
        }
    }

    /**
     * Получает цены предмета на всех площадках
     * @param {string} itemName - Название предмета
     * @returns {Promise<Array>} Массив с ценами на разных площадках
     */
    async getItemPrices(itemName) {
        if (!itemName || typeof itemName !== 'string') {
            throw new Error('Invalid item name');
        }

        try {
            // Получаем список всех доступных парсеров
            const availableParsers = await this.getAvailableSources();
            
            if (!availableParsers || availableParsers.length === 0) {
                return [];
            }

            // Запрашиваем данные из всех баз парсеров параллельно
            const allPrices = await Promise.all(
                availableParsers.map(async (source) => {
                    try {
                        const parserDb = db.getParserDatabase(source);
                        const item = await db.getAsync(parserDb, `
                            SELECT name, price, stock, timestamp 
                            FROM items 
                            WHERE name LIKE ?
                            ORDER BY timestamp DESC
                            LIMIT 1
                        `, [`%${itemName}%`]);

                        if (!item) return null;

                        return {
                            source,
                            name: item.name,
                            price: item.price / 100,
                            priceAfterCommission: this.constructor.calculateAfterCommission(item.price, source) / 100,
                            stock: item.stock,
                            timestamp: item.timestamp
                        };
                    } catch (error) {
                        logger.error(`Error getting prices from ${source}:`, error);
                        return null;
                    }
                })
            );

            // Фильтруем null-значения и возвращаем
            return allPrices.filter(Boolean);
        } catch (error) {
            logger.error('Failed to get item prices:', error.message);
            throw error;
        }
    }

    /**
     * Сравнивает цены между двумя площадками
     * @param {string} site1 - Первая площадка
     * @param {string} site2 - Вторая площадка
     * @returns {Promise<Array>} Массив с результатами сравнения
     */
    async comparePrices(site1, site2) {
        if (!site1 || !site2 || typeof site1 !== 'string' || typeof site2 !== 'string') {
            logger.error('Invalid sites in comparePrices', { site1, site2 });
            throw new Error('Invalid site parameters');
        }

        try {
            // Получаем соединения с базами данных для каждой площадки
            const db1 = db.getParserDatabase(site1);
            const db2 = db.getParserDatabase(site2);

            // Получаем все предметы из обеих баз
            const [items1, items2] = await Promise.all([
                db.allAsync(db1, 'SELECT name, price, stock FROM items'),
                db.allAsync(db2, 'SELECT name, price, stock FROM items')
            ]);

            // Создаем мапы для быстрого поиска
            const items1Map = new Map(items1.map(item => [item.name, item]));
            const items2Map = new Map(items2.map(item => [item.name, item]));

            // Находим общие предметы
            const commonItems = [...items1Map.keys()].filter(name => items2Map.has(name));

            // Сравниваем цены
            const result = commonItems.map(name => {
                const item1 = items1Map.get(name);
                const item2 = items2Map.get(name);
                
                const { profit, profitPercent, price2AfterCommission } = 
                    PriceService.calculateProfit(item1.price, item2.price, site2);
                
                return {
                    name,
                    price1: item1.price / 100,
                    price2: item2.price / 100,
                    price2AfterCommission,
                    profit,
                    profitPercent,
                    stock1: item1.stock,
                    stock2: item2.stock,
                    commission2: PriceService.COMMISSIONS[site2]
                };
            });

            logger.info('Successfully compared prices', {
                site1,
                site2,
                itemsCount: result.length
            });

            return result;
        } catch (error) {
            logger.error('Error in comparePrices', {
                error: error.message,
                site1,
                site2,
                stack: error.stack
            });
            throw new Error(`Failed to compare prices: ${error.message}`);
        }
    }

    /**
     * Получает время последнего обновления данных
     * @returns {Promise<string>} Время последнего обновления
     */
    async getLastUpdateTime() {
        try {
            const availableParsers = await this.getAvailableSources();

            if (!availableParsers || availableParsers.length === 0) {
                return 'Never';
            }

            const lastUpdates = await Promise.all(
                availableParsers.map(async (source) => {
                    const parserDb = db.getParserDatabase(source);
                    const row = await db.getAsync(parserDb, `
                        SELECT MAX(timestamp) as lastUpdate FROM items
                    `);
                    return row?.lastUpdate;
                })
            );

            const validUpdates = lastUpdates.filter(t => t);
            if (validUpdates.length === 0) {
                return 'Never';
            }

            // Находим самое свежее обновление
            return validUpdates.sort((a, b) => 
                new Date(b) - new Date(a)
            )[0];
        } catch (error) {
            logger.error('Error in getLastUpdateTime', {
                error: error.message,
                stack: error.stack
            });
            throw new Error(`Failed to get last update time: ${error.message}`);
        }
    }

    /**
     * Создает новый профиль уведомлений
     * @param {object} profileData - Данные профиля
     * @returns {Promise<number>} ID созданного профиля
     */
    async createProfile(profileData) {
        if (!profileData || typeof profileData !== 'object') {
            logger.error('Invalid profile data in createProfile', { profileData });
            throw new Error('Invalid profile data');
        }

        try {
            const result = await db.runAsync(
                db.mainDb,
                `INSERT INTO profiles (
                    name, 
                    site1, 
                    site2, 
                    minProfitPercent, 
                    hideOverstock, 
                    isActive, 
                    telegramEnabled
                ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    profileData.name,
                    profileData.site1,
                    profileData.site2,
                    profileData.minProfitPercent,
                    profileData.hideOverstock ? 1 : 0,
                    profileData.isActive ? 1 : 0,
                    profileData.telegramEnabled ? 1 : 0
                ]
            );

            logger.info('Profile created successfully', {
                profileId: result.lastID,
                profileData
            });

            return result.lastID;
        } catch (error) {
            logger.error('Error in createProfile', {
                error: error.message,
                profileData,
                stack: error.stack
            });
            throw new Error(`Failed to create profile: ${error.message}`);
        }
    }

    /**
     * Получает список всех профилей
     * @returns {Promise<Array>} Массив профилей
     */
    async getProfiles() {
        try {
            const rows = await db.allAsync(
                db.mainDb,
                `SELECT * FROM profiles 
                ORDER BY name`
            );

            const result = rows.map(row => ({
                ...row,
                hideOverstock: row.hideOverstock === 1,
                isActive: row.isActive === 1,
                telegramEnabled: row.telegramEnabled === 1
            }));

            logger.debug('Fetched profiles', { count: result.length });
            return result;
        } catch (error) {
            logger.error('Error in getProfiles', {
                error: error.message,
                stack: error.stack
            });
            throw new Error(`Failed to get profiles: ${error.message}`);
        }
    }

    /**
     * Получает список активных профилей
     * @returns {Promise<Array>} Массив активных профилей
     */
    async getActiveProfiles() {
        try {
            const rows = await db.allAsync(
                db.mainDb,
                `SELECT * FROM profiles 
                WHERE isActive = 1
                ORDER BY name`
            );

            const result = rows.map(row => ({
                ...row,
                hideOverstock: row.hideOverstock === 1,
                telegramEnabled: row.telegramEnabled === 1
            }));

            logger.debug('Fetched active profiles', { count: result.length });
            return result;
        } catch (error) {
            logger.error('Error in getActiveProfiles', {
                error: error.message,
                stack: error.stack
            });
            throw new Error(`Failed to get active profiles: ${error.message}`);
        }
    }

    /**
     * Обновляет профиль
     * @param {number} id - ID профиля
     * @param {object} updates - Обновляемые данные
     * @returns {Promise<number>} Количество измененных строк
     */
    async updateProfile(id, updates) {
        if (!id || typeof id !== 'number' || !updates || typeof updates !== 'object') {
            logger.error('Invalid parameters in updateProfile', { id, updates });
            throw new Error('Invalid parameters');
        }

        try {
            const result = await db.runAsync(
                db.mainDb,
                `UPDATE profiles SET 
                    name = ?, 
                    site1 = ?, 
                    site2 = ?, 
                    minProfitPercent = ?, 
                    hideOverstock = ?, 
                    isActive = ?,
                    telegramEnabled = ?
                WHERE id = ?`,
                [
                    updates.name,
                    updates.site1,
                    updates.site2,
                    updates.minProfitPercent,
                    updates.hideOverstock ? 1 : 0,
                    updates.isActive ? 1 : 0,
                    updates.telegramEnabled ? 1 : 0,
                    id
                ]
            );

            if (result.changes === 0) {
                logger.warn('No profile found to update', { id });
                throw new Error('Profile not found');
            }

            logger.info('Profile updated successfully', {
                id,
                changes: result.changes,
                updates
            });

            return result.changes;
        } catch (error) {
            logger.error('Error in updateProfile', {
                error: error.message,
                id,
                updates,
                stack: error.stack
            });
            throw new Error(`Failed to update profile: ${error.message}`);
        }
    }

    /**
     * Удаляет профиль
     * @param {number} id - ID профиля
     * @returns {Promise<number>} Количество удаленных строк
     */
    async deleteProfile(id) {
        if (!id || typeof id !== 'number') {
            logger.error('Invalid id in deleteProfile', { id });
            throw new Error('Invalid profile id');
        }

        try {
            const result = await db.runAsync(
                db.mainDb,
                'DELETE FROM profiles WHERE id = ?',
                [id]
            );

            if (result.changes === 0) {
                logger.warn('No profile found to delete', { id });
                throw new Error('Profile not found');
            }

            logger.info('Profile deleted successfully', {
                id,
                changes: result.changes
            });

            return result.changes;
        } catch (error) {
            logger.error('Error in deleteProfile', {
                error: error.message,
                id,
                stack: error.stack
            });
            throw new Error(`Failed to delete profile: ${error.message}`);
        }
    }

    /**
     * Проверяет наличие новых предметов по активным профилям
     * @returns {Promise<void>}
     */
    async checkForNewProfitableItems() {
        logger.info('Starting check for new profitable items');
        
        try {
            const activeProfiles = (await this.getActiveProfiles()).filter(
                p => p.telegramEnabled
            );
            
            if (activeProfiles.length === 0) {
                return;
            }

            for (const profile of activeProfiles) {
                try {
                    const comparison = await this.comparePrices(profile.site1, profile.site2);
                    
                    const profitableItems = comparison.filter(item => {
                        const isProfitable = item.profitPercent >= profile.minProfitPercent;
                        const isOverstock = profile.hideOverstock && this.isOverstock(item.stock2);
                        const stockParts = item.stock1?.split('/') || [];
                        const availableOnSite1 = parseInt(stockParts[0]) >= 1 || 
                                               (stockParts.length === 1 && parseInt(stockParts[0]) >= 1);
                        
                        return isProfitable && !isOverstock && availableOnSite1;
                    });

                    const notifiedItems = await this.getNotifiedItems(profile.id);
                    
                    const newItems = profitableItems.filter(item => {
                        const existingNotification = notifiedItems.find(n => n.item_name === item.name);
                        
                        if (!existingNotification) return true;
                        
                        const now = new Date();
                        const lastNotified = new Date(existingNotification.timestamp);
                        const hoursPassed = (now - lastNotified) / (1000 * 60 * 60);
                        
                        const stockParts = item.stock1.split('/');
                        const wasUnavailable = existingNotification.was_unavailable === 1;
                        const nowAvailable = parseInt(stockParts[0]) >= 1;
                        
                        return hoursPassed > 24 || 
                               Math.abs(item.profitPercent - existingNotification.profit_percent) > 5 ||
                               (wasUnavailable && nowAvailable);
                    });

                    if (newItems.length > 0) {
                        logger.info(`Found ${newItems.length} new items for profile ${profile.name}`);
                        
                        for (const item of newItems) {
                            try {
                                const stockParts = item.stock1.split('/');
                                const wasUnavailable = parseInt(stockParts[0]) === 0;
                                
                                await this.logNotifiedItem(
                                    profile.id, 
                                    item.name, 
                                    item.profitPercent,
                                    wasUnavailable
                                );
                                
                                const message = this.formatTelegramMessage(item, profile);
                                await TelegramService.sendMessage(message);
                            } catch (error) {
                                logger.error('Failed to send notification for item:', item.name, error.message);
                            }
                        }
                    }
                } catch (profileError) {
                    logger.error(`Error processing profile ${profile.name}:`, profileError.message);
                }
            }
        } catch (error) {
            logger.error('Error in checkForNewProfitableItems:', error.message);
            throw error;
        }
    }

    /**
     * Получает историю уведомлений для профиля
     */
    async getNotifiedItems(profileId) {
        const rows = await db.allAsync(
            db.mainDb,
            `SELECT 
                item_name, 
                profit_percent, 
                timestamp,
                was_unavailable
            FROM notification_logs 
            WHERE profile_id = ?
            ORDER BY timestamp DESC`,
            [profileId]
        );
        return rows;
    }

    /**
     * Логирует отправленное уведомление
     */
    async logNotifiedItem(profileId, itemName, profitPercent, wasUnavailable = false) {
        await db.runAsync(
            db.mainDb,
            `INSERT INTO notification_logs (
                profile_id, 
                item_name, 
                profit_percent,
                was_unavailable
            ) VALUES (?, ?, ?, ?)`,
            [profileId, itemName, profitPercent, wasUnavailable ? 1 : 0]
        );
    }

    /**
     * Проверяет, является ли предмет перезапасом
     * @param {string} stock - Строка с информацией о наличии
     * @returns {boolean} Результат проверки
     */
    isOverstock(stock) {
        if (!stock || typeof stock !== 'string') return false;
        
        if (stock.includes('/')) {
            const parts = stock.split('/');
            if (parts.length !== 2) return false;
            
            const have = parseInt(parts[0]);
            const max = parseInt(parts[1]);
            
            if (isNaN(have) || isNaN(max)) return false;
            
            return have >= max || max === 0;
        }
        
        return false;
    }

    /**
     * Форматирует сообщение для Telegram
     * @param {object} item - Данные предмета
     * @param {object} profile - Данные профиля
     * @returns {string} Отформатированное сообщение
     */
    formatTelegramMessage(item, profile) {
        const site1Name = formatSiteName(profile.site1);
        const site2Name = formatSiteName(profile.site2);
        const overstockWarning = this.isOverstock(item.stock2) ? '⚠️ <b>ПЕРЕЗАПАС</b> на ' + site2Name : '';

        return `
<b>🚀 НОВЫЙ ВЫГОДНЫЙ ПРЕДМЕТ</b>

<b>Предмет:</b> ${item.name}
<b>Направление:</b> ${site1Name} → ${site2Name}
<b>Цены:</b> $${item.price1.toFixed(2)} → $${item.price2.toFixed(2)}
<b>После комиссии:</b> $${item.price2AfterCommission.toFixed(2)}
<b>Прибыль:</b> ${item.profitPercent > 0 ? '+' : ''}${item.profitPercent.toFixed(2)}%

${overstockWarning}

<b>Профиль:</b> ${profile.name}
        `;
    }
}

// Экспортируем экземпляр сервиса
module.exports = {
    PriceService,
    priceService: new PriceService()
};