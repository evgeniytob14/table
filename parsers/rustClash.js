const axios = require('axios');
const { setTimeout } = require('timers/promises');

class RustClashParser {
    static SOURCE = 'rustclash';
    static COMMISSION = 5;
    static BASE_URL = 'https://rustclash.com/api/steam/shop';
    static MAX_RETRIES = 5;
    static RETRY_DELAY = 5000;
    
    static HEADERS = {
        'Authority': 'rustclash.com',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'ru,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Origin': 'https://rustclash.com',
        'Pragma': 'no-cache',
        'Referer': 'https://rustclash.com/',
        'Sec-Ch-Ua': '"Not A(Brand";v="8", "Chromium";v="132", "YaBrowser";v="25"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 YaBrowser/25.2.0.0 Safari/537.36',
        'X-Requested-With': 'XMLHttpRequest'
    };

    constructor() {
        this.lastRequestTime = 0;
        this.requestInterval = 1000; // 1 second between requests
    }

    async fetchWithRetry(retryCount = 0) {
        try {
            // Rate limiting
            const now = Date.now();
            const timeSinceLastRequest = now - this.lastRequestTime;
            if (timeSinceLastRequest < this.requestInterval) {
                await setTimeout(this.requestInterval - timeSinceLastRequest);
            }

            const { data } = await axios.get(RustClashParser.BASE_URL, {
                timeout: 15000,
                headers: RustClashParser.HEADERS,
                params: {
                    _: Date.now() // Cache buster
                },
                validateStatus: (status) => {
                    return status === 200 || status === 304;
                }
            });

            this.lastRequestTime = Date.now();

            if (!Array.isArray(data)) {
                throw new Error('Invalid API response structure');
            }

            return data;
        } catch (error) {
            if (retryCount < RustClashParser.MAX_RETRIES) {
                const delay = RustClashParser.RETRY_DELAY * (retryCount + 1);
                console.warn(`Retry ${retryCount + 1} after ${delay}ms...`);
                await setTimeout(delay);
                return this.fetchWithRetry(retryCount + 1);
            }
            throw new Error(`Failed to fetch data: ${error.message}`);
        }
    }

    async parse() {
        try {
            console.log('[RustClash] Starting parsing...');
            const startTime = Date.now();
            
            const allItems = await this.fetchWithRetry();
            
            // Group items by name to count duplicates
            const itemsMap = new Map();
            
            allItems.forEach(item => {
                if (item?.price > 0) {
                    const key = item.name.trim().toLowerCase();
                    if (!itemsMap.has(key)) {
                        itemsMap.set(key, {
                            name: item.name.trim(),
                            price: item.price, // Already in cents
                            count: 0,
                            firstItem: item
                        });
                    }
                    itemsMap.get(key).count += 1;
                }
            });

            // Convert to standard format
            const normalizedItems = Array.from(itemsMap.values()).map(item => ({
                name: item.name,
                price: item.price,
                stock: item.count.toString(),
                source: RustClashParser.SOURCE,
                id: item.firstItem.id.toString(),
                image: item.firstItem.imageUrl,
                category: this.detectCategory(item.name),
                rawData: item.firstItem
            }));

            console.log(`[RustClash] Parsed ${normalizedItems.length} unique items (from ${allItems.length} entries) in ${((Date.now() - startTime)/1000).toFixed(1)}s`);
            return normalizedItems;
        } catch (error) {
            console.error('[RustClash] Parser error:', error.message);
            throw new Error(`RustClash parsing failed: ${error.message}`);
        }
    }

    detectCategory(name) {
        const lowerName = name.toLowerCase();
        if (lowerName.includes('ak47') || lowerName.includes('rifle')) return 'Weapon';
        if (lowerName.includes('gloves') || lowerName.includes('hoodie') || lowerName.includes('jacket')) return 'Clothing';
        if (lowerName.includes('helmet') || lowerName.includes('mask')) return 'Headgear';
        return 'Other';
    }

    async test() {
        console.log('[RustClash] Running self-test...');
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

            console.log('[RustClash] Self-test passed successfully');
            return {
                success: true,
                itemsCount: items.length,
                sampleItem: {
                    name: sample.name,
                    price: `$${(sample.price/100).toFixed(2)}`,
                    stock: sample.stock,
                    category: sample.category,
                    image: sample.image
                }
            };
        } catch (error) {
            console.error('[RustClash] Self-test failed:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = new RustClashParser();