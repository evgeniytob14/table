const axios = require('axios');
const { setTimeout } = require('timers/promises');

class RustTmBuyOrdersParser {
    static SOURCE = 'rusttm_buy_orders';
    static REFRESH_INTERVAL = 'api';
    static COMMISSION = 5;
    static BASE_URL = 'https://rust.tm/api/v2/prices/orders/USD.json';
    static MAX_RETRIES = 3;
    static RETRY_DELAY = 2000;

    async fetchWithRetry(url, retryCount = 0) {
        try {
            const { data } = await axios.get(url, {
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Accept': 'application/json'
                }
            });
            return data;
        } catch (error) {
            if (retryCount < RustTmBuyOrdersParser.MAX_RETRIES) {
                console.warn(`Попытка ${retryCount + 1} для ${url}`);
                await setTimeout(RustTmBuyOrdersParser.RETRY_DELAY);
                return this.fetchWithRetry(url, retryCount + 1);
            }
            throw new Error(`Ошибка при запросе ${url}: ${error.message}`);
        }
    }

    async parse() {
        try {
            console.log('[Rust.tm Buy Orders] Начало парсинга...');
            const startTime = Date.now();
            
            const response = await this.fetchWithRetry(RustTmBuyOrdersParser.BASE_URL);
            
            if (!response?.success) {
                throw new Error(`API вернуло success: false. Полный ответ: ${JSON.stringify(response)}`);
            }
            
            if (!Array.isArray(response?.items)) {
                throw new Error('Некорректная структура ответа API: items не является массивом');
            }

            console.log(`[Debug] Получено ${response.items.length} ордеров перед фильтрацией`);
            
            const normalizedItems = response.items
                .filter(item => {
                    // Основной критерий - наличие названия и положительной цены
                    const valid = item?.market_hash_name && 
                                 parseFloat(item?.price) > 0;
                    if (!valid) {
                        console.log('[Debug] Отфильтрован ордер:', item);
                    }
                    return valid;
                })
                .map(item => ({
                    name: item.market_hash_name.trim(),
                    price: Math.round(parseFloat(item.price) * 100), // Конвертируем доллары в центы
                    stock: '1', // По умолчанию 1, так как volume не предоставляется
                    source: RustTmBuyOrdersParser.SOURCE,
                    id: this.generateId(item.market_hash_name),
                    rawData: item
                }));

            console.log(`[Rust.tm Buy Orders] Обработано ${normalizedItems.length} ордеров за ${((Date.now() - startTime)/1000).toFixed(1)} сек.`);
            return normalizedItems;
        } catch (error) {
            console.error('[Rust.tm Buy Orders] Ошибка парсера:', error.message);
            throw new Error(`Ошибка парсинга ордеров Rust.tm: ${error.message}`);
        }
    }

    generateId(name) {
        return name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
    }

    async test() {
        console.log('[Rust.tm Buy Orders] Запуск самопроверки...');
        try {
            const items = await this.parse();
            
            console.log('[Debug] Примеры обработанных ордеров:', items.slice(0, 3));
            
            if (!items || items.length === 0) {
                console.warn('[Debug] Получено 0 ордеров. Возможные причины:');
                console.warn('- API не вернуло ордеры');
                console.warn('- Все ордеры были отфильтрованы');
                console.warn('- Проблема с подключением к API');
                throw new Error('Не удалось получить ордеры. Проверьте debug-логи для подробностей.');
            }

            const sample = items[0];
            const requiredFields = ['name', 'price', 'stock', 'source', 'id'];
            const missingFields = requiredFields.filter(f => !(f in sample));
            
            if (missingFields.length > 0) {
                throw new Error(`Отсутствуют обязательные поля: ${missingFields.join(', ')}`);
            }

            console.log('[Rust.tm Buy Orders] Самопроверка успешно пройдена');
            return {
                success: true,
                itemsCount: items.length,
                sampleItem: {
                    name: sample.name,
                    price: `$${(sample.price/100).toFixed(2)}`,
                    stock: sample.stock,
                    id: sample.id
                }
            };
        } catch (error) {
            console.error('[Rust.tm Buy Orders] Ошибка самопроверки:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = new RustTmBuyOrdersParser();