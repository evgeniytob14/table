const WebSocket = require('ws');

class RustRollParser {
    static SOURCE = 'rustroll';
    static WS_URL = 'wss://rustroll.com/api/socket.io/?EIO=4&transport=websocket';
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
                    'Origin': 'https://rustroll.com',
                    'Cookie': '_gcl_au=1.1.168024540.1746140097; crisp-client%2Fsession%2F90ab508a-72cb-4875-8697-221c694668dd=session_89abca15-1c74-40a3-97da-03cf146ecf28; token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI2ODEzZmVlNzNmYWU0ZGU0YmI4M2E4MjMiLCJpYXQiOjE3NDY1NDAzMTIsImV4cCI6MTc0NjcxMzExMn0.jlxa6KAn63FDwNJCWsfT0TrFq3KJoX-wvmaqi2Zy4zU'
                }
            });

            this.ws.on('open', () => {
                console.log('[RustRoll] WebSocket connected');
                this.send('40');
                this.send('420["cashier:steam:getWithdrawData", null]');
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
        if (message.startsWith('40')) return;
        
        if (message.startsWith('430')) {
            const payload = JSON.parse(message.substring(3));
            if (Array.isArray(payload) && payload[0]?.success) {
                this.processInventory(payload[0].items);
                this.completeParsing();
            }
        }
    }

    processInventory(inventory) {
        const itemsMap = new Map();

        inventory.forEach(item => {
            const name = item.name.trim();
            const price = Math.round(item.amount / 10); // Было: const price = item.amount;

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
            existing.count += item.count || 1;
            existing.ids.push(item._id);
            if (item.image) existing.images.add(item.image);
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

        console.log(`[RustRoll] Processed ${this.items.length} unique items`);
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
        console.log('[RustRoll] Running self-test...');
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

            console.log('[RustRoll] Self-test passed successfully');
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
            console.error('[RustRoll] Self-test error:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = new RustRollParser();