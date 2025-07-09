const axios = require('axios');
const { setTimeout } = require('timers/promises');

class RustTmParser {
    static SOURCE = 'rusttm';
	static REFRESH_INTERVAL = 'api';
    static COMMISSION = 5;
    static BASE_URL = 'https://rust.tm/api/v2/prices/USD.json';
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
            if (retryCount < RustTmParser.MAX_RETRIES) {
                console.warn(`Попытка ${retryCount + 1} для ${url}`);
                await setTimeout(RustTmParser.RETRY_DELAY);
                return this.fetchWithRetry(url, retryCount + 1);
            }
            throw new Error(`Ошибка при запросе ${url}: ${error.message}`);
        }
    }

    async parse() {
        try {
            console.log('[Rust.tm] Начало парсинга...');
            const startTime = Date.now();
            
            const response = await this.fetchWithRetry(RustTmParser.BASE_URL);
            
            if (!response?.success || !Array.isArray(response?.items)) {
                throw new Error('Некорректная структура ответа API');
            }

            const normalizedItems = response.items
                .filter(item => parseFloat(item?.price) > 0 && parseInt(item?.volume) > 0)
                .map(item => ({
                    name: item.market_hash_name.trim(),
                    price: Math.round(parseFloat(item.price) * 100), // Конвертируем доллары в центы
                    stock: item.volume.toString(),
                    source: RustTmParser.SOURCE,
                    id: this.generateId(item.market_hash_name), // Генерируем ID из названия
                    rawData: item // Для отладки
                }));

            console.log(`[Rust.tm] Обработано ${normalizedItems.length} предметов за ${((Date.now() - startTime)/1000).toFixed(1)} сек.`);
            return normalizedItems;
        } catch (error) {
            console.error('[Rust.tm] Ошибка парсера:', error.message);
            throw new Error(`Ошибка парсинга Rust.tm: ${error.message}`);
        }
    }

    // Генерация ID на основе названия предмета
    generateId(name) {
        return name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
    }

    async test() {
        console.log('[Rust.tm] Запуск самопроверки...');
        try {
            const items = await this.parse();
            
            if (!items || items.length === 0) {
                throw new Error('Не удалось получить предметы');
            }

            const sample = items[0];
            const requiredFields = ['name', 'price', 'stock', 'source'];
            const missingFields = requiredFields.filter(f => !(f in sample));
            
            if (missingFields.length > 0) {
                throw new Error(`Отсутствуют обязательные поля: ${missingFields.join(', ')}`);
            }

            console.log('[Rust.tm] Самопроверка успешно пройдена');
            return {
                success: true,
                itemsCount: items.length,
                sampleItem: {
                    name: sample.name,
                    price: `$${(sample.price/100).toFixed(2)}`,
                    stock: sample.stock
                }
            };
        } catch (error) {
            console.error('[Rust.tm] Ошибка самопроверки:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = new RustTmParser();