const WebSocket = require('ws');

class RustyLootParser {
    static SOURCE = 'rustyloot';
    static WS_URL = 'wss://api.rustyloot.gg/socket.io/?language=ru&EIO=4&transport=websocket';
    static REQUEST_TIMEOUT = 15000;

    constructor() {
        this.ws = null;
        this.items = [];
        this.resolvePromise = null;
        this.rejectPromise = null;
    }

    async parse() {
        return new Promise((resolve, reject) => {
            this.resolvePromise = resolve;
            this.rejectPromise = reject;

            const timeout = setTimeout(() => {
                this.cleanUp();
                reject(new Error('Timeout waiting for WebSocket data'));
            }, this.constructor.REQUEST_TIMEOUT);

            this.ws = new WebSocket(this.constructor.WS_URL, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Origin': 'https://rustyloot.gg'
                }
            });

            this.ws.on('open', () => {
                console.log('[RustyLoot] WebSocket connected');
                this.send('40{"language":"ru"}');
            });

            this.ws.on('message', (data) => {
                try {
                    this.handleMessage(data.toString());
                } catch (error) {
                    this.cleanUp();
                    reject(error);
                }
            });

            this.ws.on('close', () => {
                if (!this.items.length) {
                    reject(new Error('WebSocket closed before data was received'));
                }
            });

            this.ws.on('error', (error) => {
                this.cleanUp();
                reject(error);
            });
        });
    }

    handleMessage(message) {
        if (message.startsWith('0')) return;
        if (message.startsWith('40')) {
            this.send('422["steam:market",{"search":"","asc":false,"offset":0,"limit":9999}]');
            return;
        }

        if (message.startsWith('432')) {
            const payload = JSON.parse(message.substring(3));
            const inventory = payload[0]?.data?.inventory || [];
            this.processInventory(inventory);
            this.completeParsing();
        }
    }

    processInventory(inventory) {
        const itemsMap = new Map();

        inventory.forEach(item => {
            const name = item.name.trim();
            const price = Math.round(item.price / 10);

            if (!itemsMap.has(name)) {
                itemsMap.set(name, {
                    name,
                    price,
                    count: 0,
                    ids: [],
                    images: new Set(),
                    rawData: []
                });
            }

            const existing = itemsMap.get(name);
            existing.count++;
            existing.ids.push(item.assetid);
            existing.images.add(item.image);
            existing.rawData.push(item);
        });

        this.items = Array.from(itemsMap.values()).map(item => ({
            name: item.name,
            price: item.price,
            stock: item.count.toString(),
            source: this.constructor.SOURCE,
            ids: item.ids,
            images: Array.from(item.images),
            rawData: item.rawData
        }));

        console.log(`[RustyLoot] Processed ${this.items.length} unique items (${inventory.length} total entries)`);
    }

    completeParsing() {
        this.cleanUp();
        if (this.resolvePromise) {
            this.resolvePromise(this.items);
        }
    }

    cleanUp() {
        if (this.ws) {
            this.ws.removeAllListeners();
            if (this.ws.readyState === WebSocket.OPEN) {
                this.ws.close();
            }
            this.ws = null;
        }
    }

    send(message) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(message);
        }
    }

    async test() {
        console.log('[RustyLoot] Running self-test...');
        try {
            const items = await this.parse();
            
            if (!items || items.length === 0) {
                throw new Error('Failed to get items');
            }

            const sample = items[0];
            const requiredFields = ['name', 'price', 'stock', 'source'];
            const missingFields = requiredFields.filter(f => !(f in sample));
            
            if (missingFields.length > 0) {
                throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
            }

            console.log('[RustyLoot] Self-test passed successfully');
            return {
                success: true,
                itemsCount: items.length,
                sampleItem: {
                    name: sample.name,
                    price: `$${(sample.price/100).toFixed(2)}`,
                    stock: sample.stock,
                    images: sample.images
                }
            };
        } catch (error) {
            console.error('[RustyLoot] Self-test error:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = new RustyLootParser();