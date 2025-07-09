const axios = require('axios');
const { setTimeout } = require('timers/promises');

class TradeItParser {
    static SOURCE = 'tradeit';
    static COMMISSION = 5;
    static BASE_URL = 'https://tradeit.gg/api/v2/inventory/data';
    static DEFAULT_PARAMS = {
        gameId: 252490, // Rust
        sortType: 'Price+-+high',
        limit: 50000,
        isForStore: 0
    };
    static MAX_RETRIES = 3;
    static RETRY_DELAY = 2000;

    async fetchWithRetry(offset, retryCount = 0) {
        try {
            const params = { ...TradeItParser.DEFAULT_PARAMS, offset };
            const { data } = await axios.get(TradeItParser.BASE_URL, {
                params,
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });
            return data;
        } catch (error) {
            if (retryCount < TradeItParser.MAX_RETRIES) {
                console.warn(`Retry ${retryCount + 1} for offset=${offset}`);
                await setTimeout(TradeItParser.RETRY_DELAY);
                return this.fetchWithRetry(offset, retryCount + 1);
            }
            throw new Error(`Failed to fetch page (offset=${offset}): ${error.message}`);
        }
    }

    async parse() {
        try {
            console.log('[TradeIt] Starting parsing...');
            const startTime = Date.now();
            
            // Параллельная загрузка двух страниц
            const [page1, page2] = await Promise.all([
                this.fetchWithRetry(0),
                this.fetchWithRetry(1500)
            ]);

            if (!page1?.items || !page2?.items) {
                throw new Error('Invalid API response structure');
            }

            // Объединяем данные
            const combinedCounts = { ...page1.counts, ...page2.counts };
            const allItems = [...page1.items, ...page2.items];

            // Нормализация предметов
            const normalizedItems = allItems
                .filter(item => item?.sitePrice > 0) // Фильтруем предметы с ценой
                .map(item => ({
                    name: item.name.trim(),
                    price: Math.round(item.sitePrice),
                    stock: (combinedCounts[item._id] || 0).toString(),
                    source: TradeItParser.SOURCE,
                    id: item._id,
                    rawData: item // Для отладки
                }));

            console.log(`[TradeIt] Parsed ${normalizedItems.length} items in ${((Date.now() - startTime)/1000).toFixed(1)}s`);
            return normalizedItems;
        } catch (error) {
            console.error('[TradeIt] Parser error:', error.message);
            throw new Error(`TradeIt parsing failed: ${error.message}`);
        }
    }

    async test() {
        console.log('[TradeIt] Running self-test...');
        try {
            const items = await this.parse();
            
            if (!items || items.length === 0) {
                throw new Error('No items parsed');
            }

            // Проверка структуры данных
            const sample = items[0];
            const requiredFields = ['name', 'price', 'stock', 'source'];
            const missingFields = requiredFields.filter(f => !(f in sample));
            
            if (missingFields.length > 0) {
                throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
            }

            console.log('[TradeIt] Self-test passed successfully');
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
            console.error('[TradeIt] Self-test failed:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

// Экспорт синглтона
module.exports = new TradeItParser();