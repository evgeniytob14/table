const axios = require('axios');
const { setTimeout } = require('timers/promises');

class SkinSwapParser {
    static SOURCE = 'skinswap';
    static COMMISSION = 5;
    static BASE_URL = 'https://api.skinswap.com/api/site/inventory/';
    static DEFAULT_PARAMS = {
        appid: 252490,
        sort: 'price-desc',
        priceMin: 0,
        priceMax: 5000000,
        tradehold: 8,
        limit: 100
    };
    static MAX_RETRIES = 3;
    static RETRY_DELAY = 2000;
    static CONCURRENCY = 5;

    async fetchWithRetry(offset, retryCount = 0) {
        try {
            const params = { ...SkinSwapParser.DEFAULT_PARAMS, offset };
            const { data } = await axios.get(SkinSwapParser.BASE_URL, {
                params,
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });
            
            if (!data?.success) {
                throw new Error('Invalid API response');
            }
            
            return data;
        } catch (error) {
            if (retryCount < SkinSwapParser.MAX_RETRIES) {
                await setTimeout(SkinSwapParser.RETRY_DELAY);
                return this.fetchWithRetry(offset, retryCount + 1);
            }
            throw new Error(`Failed to fetch offset=${offset}: ${error.message}`);
        }
    }

    async fetchAllPages() {
        let currentOffset = 0;
        let allItems = [];
        let hasMore = true;
        
        try {
            const firstPage = await this.fetchWithRetry(0);
            if (!firstPage?.data) {
                throw new Error('Failed to get initial page');
            }
            allItems = firstPage.data;
            hasMore = firstPage.data.length === SkinSwapParser.DEFAULT_PARAMS.limit;
            currentOffset = SkinSwapParser.DEFAULT_PARAMS.limit;
        } catch (error) {
            console.error('Error fetching initial page:', error);
            throw error;
        }

        while (hasMore) {
            const batchOffsets = [];
            for (let i = 0; i < SkinSwapParser.CONCURRENCY; i++) {
                batchOffsets.push(currentOffset);
                currentOffset += SkinSwapParser.DEFAULT_PARAMS.limit;
            }

            try {
                const batchPromises = batchOffsets.map(offset => 
                    this.fetchWithRetry(offset).catch(e => {
                        console.warn(`Skipping offset ${offset} due to error:`, e.message);
                        return { data: [] };
                    })
                );
                
                const batchResults = await Promise.all(batchPromises);
                const batchItems = batchResults.flatMap(res => res.data || []);
                allItems = allItems.concat(batchItems);
                
                hasMore = batchItems.length > 0 && 
                         batchItems.length === SkinSwapParser.DEFAULT_PARAMS.limit * SkinSwapParser.CONCURRENCY;
                
                await setTimeout(300);
            } catch (error) {
                console.error('Error in batch processing:', error);
                hasMore = false;
            }
        }

        return allItems;
    }

    async parse() {
        try {
            console.log('[SkinSwap] Starting parallel parsing...');
            const startTime = Date.now();
            
            const allItems = await this.fetchAllPages();
            
            const normalizedItems = allItems
                .filter(item => item?.price?.trade > 0 && item?.overstock?.count > 0)
                .map(item => ({
                    name: item.name.trim(),
                    price: Math.round(item.price.trade),
                    stock: item.overstock.count.toString(),
                    source: SkinSwapParser.SOURCE,
                    id: item.stackId,
                    category: item.qualities?.type || 'Unknown',
                    rawData: item
                }));

            console.log(`[SkinSwap] Parsed ${normalizedItems.length} items in ${((Date.now() - startTime)/1000).toFixed(1)}s`);
            return normalizedItems;
        } catch (error) {
            console.error('[SkinSwap] Parser error:', error.message);
            throw new Error(`SkinSwap parsing failed: ${error.message}`);
        }
    }

    async test() {
        console.log('[SkinSwap] Running self-test...');
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

            console.log('[SkinSwap] Self-test passed successfully');
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
            console.error('[SkinSwap] Self-test failed:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = new SkinSwapParser();