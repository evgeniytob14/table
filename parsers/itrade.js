const axios = require('axios');
const { setTimeout } = require('timers/promises');

class ITradeParser {
    static SOURCE = 'itrade';
    static COMMISSION = 5;
    static BASE_URL = 'https://api.itrade.gg/inventory/bot/rust';
    static DATA_URL = 'https://api.itrade.gg/inventory/bot/rust-data';
    static MAX_RETRIES = 3;
    static RETRY_DELAY = 2000;
    static BATCH_SIZE = 100;

    async fetchWithRetry(url, params = null, retryCount = 0) {
        try {
            const { data } = await axios.get(url, {
                params,
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });
            return data;
        } catch (error) {
            if (retryCount < ITradeParser.MAX_RETRIES) {
                console.warn(`Попытка ${retryCount + 1} для ${url}`);
                await setTimeout(ITradeParser.RETRY_DELAY);
                return this.fetchWithRetry(url, params, retryCount + 1);
            }
            throw new Error(`Ошибка при запросе ${url}: ${error.message}`);
        }
    }

    async fetchItemsBatch(ids) {
        try {
            const idsParam = JSON.stringify(ids);
            const data = await this.fetchWithRetry(ITradeParser.DATA_URL, { ids: idsParam });
            
            if (!data?.success || !data?.data) {
                throw new Error('Некорректная структура ответа API');
            }

            return data.data;
        } catch (error) {
            console.error(`Ошибка при получении пачки: ${error.message}`);
            return null;
        }
    }

    async parse() {
        try {
            console.log('[ITrade] Начало парсинга...');
            const startTime = Date.now();
            
            const idResponse = await this.fetchWithRetry(ITradeParser.BASE_URL);
            
            if (!idResponse?.success || !idResponse?.data?.stack_ids) {
                throw new Error('Некорректная структура ответа с ID предметов');
            }

            const allIds = idResponse.data.stack_ids;
            console.log(`[ITrade] Найдено ${allIds.length} предметов для обработки`);

            const batches = [];
            for (let i = 0; i < allIds.length; i += ITradeParser.BATCH_SIZE) {
                batches.push(allIds.slice(i, i + ITradeParser.BATCH_SIZE));
            }

            const batchResults = await Promise.all(batches.map(batch => this.fetchItemsBatch(batch)));
            
            const combinedData = {
                data: {},
                price: {},
                stack: {}
            };

            batchResults.forEach(batch => {
                if (!batch) return;
                
                Object.assign(combinedData.data, batch.data || {});
                Object.assign(combinedData.price, batch.price || {});
                Object.assign(combinedData.stack, batch.stack || {});
            });

            const normalizedItems = [];
            
            for (const [id, itemData] of Object.entries(combinedData.data)) {
                const price = combinedData.price[id];
                const stock = combinedData.stack[id] ? combinedData.stack[id].length : 0;
                
                if (price > 0 && stock > 0) {
                    normalizedItems.push({
                        name: itemData.market_hash_name.trim(),
                        price: Math.round(price),
                        stock: stock.toString(),
                        source: ITradeParser.SOURCE,
                        id: id,
                        rawData: itemData
                    });
                }
            }

            console.log(`[ITrade] Обработано ${normalizedItems.length} предметов за ${((Date.now() - startTime)/1000).toFixed(1)} сек.`);
            return normalizedItems;
        } catch (error) {
            console.error('[ITrade] Ошибка парсера:', error.message);
            throw new Error(`Ошибка парсинга ITrade: ${error.message}`);
        }
    }

    async test() {
        console.log('[ITrade] Запуск самопроверки...');
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

            console.log('[ITrade] Самопроверка успешно пройдена');
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
            console.error('[ITrade] Ошибка самопроверки:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = new ITradeParser();