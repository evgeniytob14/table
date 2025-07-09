const axios = require('axios');
const { setTimeout } = require('timers/promises');

class RustBetParser {
    static SOURCE = 'rustbet';
    static COMMISSION = 5;
    static BASE_URL = 'https://trade.rustbet.com/api/v1/public/gm/inventory/v2';
    static DEFAULT_PARAMS = {
        app_id: 252490, // Rust
        order: 'DESC',
        orderBy: 'price',
        per_page: 60
    };
    static MAX_RETRIES = 3;
    static RETRY_DELAY = 2000;
    static CONCURRENCY = 3; // Количество одновременных запросов

    async fetchPage(page, retryCount = 0) {
        try {
            const params = { ...RustBetParser.DEFAULT_PARAMS, page };
            const { data } = await axios.get(RustBetParser.BASE_URL, {
                params,
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });
            
            if (!data?.data || !data?.meta) {
                throw new Error('Invalid API response structure');
            }
            
            return data;
        } catch (error) {
            if (retryCount < RustBetParser.MAX_RETRIES) {
                await setTimeout(RustBetParser.RETRY_DELAY);
                return this.fetchPage(page, retryCount + 1);
            }
            throw new Error(`Failed to fetch page ${page}: ${error.message}`);
        }
    }

    async fetchAllPages() {
        try {
            // Сначала получаем первую страницу для определения общего количества страниц
            const firstPage = await this.fetchPage(1);
            const totalPages = firstPage.meta.last_page;
            
            // Если всего одна страница, возвращаем её данные
            if (totalPages === 1) {
                return firstPage.data;
            }

            // Создаем массив промисов для всех страниц
            const pagePromises = [];
            for (let page = 2; page <= totalPages; page++) {
                pagePromises.push(this.fetchPage(page));
            }

            // Выполняем запросы пачками
            let allData = [...firstPage.data];
            for (let i = 0; i < pagePromises.length; i += RustBetParser.CONCURRENCY) {
                const batch = pagePromises.slice(i, i + RustBetParser.CONCURRENCY);
                const results = await Promise.all(batch);
                results.forEach(result => {
                    allData = allData.concat(result.data);
                });
                // Небольшая задержка между пачками
                await setTimeout(500);
            }

            return allData;
        } catch (error) {
            console.error('Error fetching all pages:', error);
            throw error;
        }
    }

    async parse() {
        try {
            console.log('[RustBet] Starting parsing...');
            const startTime = Date.now();
            
            const allItems = await this.fetchAllPages();
            
            // Группируем предметы по имени для подсчета количества
            const itemsMap = new Map();
            
            allItems.forEach(item => {
                if (item?.price > 0) {
                    const key = item.market_hash_name;
                    if (!itemsMap.has(key)) {
                        itemsMap.set(key, {
                            name: item.market_hash_name,
                            price: Math.round(item.price * 100), // Конвертируем в центы
                            count: 0,
                            firstItem: item // Сохраняем первый экземпляр для остальных данных
                        });
                    }
                    itemsMap.get(key).count += item.amount || 1;
                }
            });

            // Преобразуем в стандартный формат
            const normalizedItems = Array.from(itemsMap.values()).map(item => ({
                name: item.name.trim(),
                price: item.price,
                stock: item.count.toString(),
                source: RustBetParser.SOURCE,
                id: item.firstItem.unique_id,
                image: item.firstItem.icon,
                rawData: item.firstItem // Для отладки
            }));

            console.log(`[RustBet] Parsed ${normalizedItems.length} items (${allItems.length} entries) in ${((Date.now() - startTime)/1000).toFixed(1)}s`);
            return normalizedItems;
        } catch (error) {
            console.error('[RustBet] Parser error:', error.message);
            throw new Error(`RustBet parsing failed: ${error.message}`);
        }
    }

    async test() {
        console.log('[RustBet] Running self-test...');
        try {
            const items = await this.parse();
            
            if (!items || items.length === 0) {
                throw new Error('No items parsed');
            }

            const sample = items[0];
            const requiredFields = ['name', 'price', 'stock', 'source'];
            const missingFields = requiredFields.filter(f => !(f in sample));
            
            if (missingFields.length > 0) {
                throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
            }

            console.log('[RustBet] Self-test passed successfully');
            return {
                success: true,
                itemsCount: items.length,
                sampleItem: {
                    name: sample.name,
                    price: `$${(sample.price/100).toFixed(2)}`,
                    stock: sample.stock,
                    image: sample.image
                }
            };
        } catch (error) {
            console.error('[RustBet] Self-test failed:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = new RustBetParser();