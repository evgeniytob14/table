const axios = require('axios');
const { setTimeout } = require('timers/promises');

class RustReaperParser {
    static SOURCE = 'rustreaper';
    static COMMISSION = 5;
    static BASE_URL = 'https://rustreaper.com/api/steam/marketplace/items';
    static DEFAULT_PARAMS = {
        order: 'expensive-first'
    };
    static MAX_RETRIES = 3;
    static RETRY_DELAY = 2000;

    async fetchWithRetry(retryCount = 0) {
        try {
            const { data } = await axios.get(RustReaperParser.BASE_URL, {
                params: RustReaperParser.DEFAULT_PARAMS,
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });
            
            if (!data?.items) {
                throw new Error('Invalid API response structure');
            }
            
            return data;
        } catch (error) {
            if (retryCount < RustReaperParser.MAX_RETRIES) {
                console.warn(`Retry ${retryCount + 1}`);
                await setTimeout(RustReaperParser.RETRY_DELAY);
                return this.fetchWithRetry(retryCount + 1);
            }
            throw new Error(`Failed to fetch data: ${error.message}`);
        }
    }

    async parse() {
        try {
            console.log('[RustReaper] Starting parsing...');
            const startTime = Date.now();
            
            const response = await this.fetchWithRetry();
            
            // Нормализация предметов (цена делится на 100, так как в API она умножена на 100)
            const normalizedItems = response.items
                .filter(item => item?.price > 0 && item?.amount > 0)
                .map(item => ({
                    name: item.name.trim(),
                    price: Math.round(item.price / 100), // Делим на 100 для получения цены в центах
                    stock: item.amount.toString(),
                    source: RustReaperParser.SOURCE,
                    id: item.assetId,
                    image: item.img,
                    rawData: item // Для отладки
                }));

            console.log(`[RustReaper] Parsed ${normalizedItems.length} items in ${((Date.now() - startTime)/1000).toFixed(1)}s`);
            return normalizedItems;
        } catch (error) {
            console.error('[RustReaper] Parser error:', error.message);
            throw new Error(`RustReaper parsing failed: ${error.message}`);
        }
    }

    async test() {
        console.log('[RustReaper] Running self-test...');
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

            console.log('[RustReaper] Self-test passed successfully');
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
            console.error('[RustReaper] Self-test failed:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

// Экспорт синглтона
module.exports = new RustReaperParser();