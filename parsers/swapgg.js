const axios = require('axios');
const { setTimeout } = require('timers/promises');

class SwapGgParser {
    static SOURCE = 'swapgg';
    static COMMISSION = 5;
    static BASE_URL = 'https://api.swap.gg/v2/trade/inventory/bot/252490';
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
            if (retryCount < SwapGgParser.MAX_RETRIES) {
                console.warn(`Попытка ${retryCount + 1} для ${url}`);
                await setTimeout(SwapGgParser.RETRY_DELAY);
                return this.fetchWithRetry(url, retryCount + 1);
            }
            throw new Error(`Ошибка при запросе ${url}: ${error.message}`);
        }
    }

    async parse() {
        try {
            console.log('[Swap.gg] Начало парсинга...');
            const startTime = Date.now();
            
            const response = await this.fetchWithRetry(SwapGgParser.BASE_URL);
            
            if (response?.status !== 'OK' || !Array.isArray(response?.result)) {
                throw new Error('Некорректная структура ответа API');
            }

            const normalizedItems = response.result
                .filter(item => item?.p > 0 && item?.a?.length > 0) // Фильтруем предметы с ценой и наличием
                .map(item => ({
                    name: item.n.trim(),
                    price: Math.round(item.p),
                    stock: item.a.length.toString(),
                    source: SwapGgParser.SOURCE,
                    id: item.i, // Используем image ID как идентификатор
                    category: item.m?.[8] || 'Unknown', // Категория из метаданных
                    rawData: item // Для отладки
                }));

            console.log(`[Swap.gg] Обработано ${normalizedItems.length} предметов за ${((Date.now() - startTime)/1000).toFixed(1)} сек.`);
            return normalizedItems;
        } catch (error) {
            console.error('[Swap.gg] Ошибка парсера:', error.message);
            throw new Error(`Ошибка парсинга Swap.gg: ${error.message}`);
        }
    }

    async test() {
        console.log('[Swap.gg] Запуск самопроверки...');
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

            console.log('[Swap.gg] Самопроверка успешно пройдена');
            return {
                success: true,
                itemsCount: items.length,
                sampleItem: {
                    name: sample.name,
                    price: `$${(sample.price/100).toFixed(2)}`,
                    stock: sample.stock,
                    category: sample.category
                }
            };
        } catch (error) {
            console.error('[Swap.gg] Ошибка самопроверки:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = new SwapGgParser();