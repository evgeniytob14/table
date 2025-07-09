const axios = require('axios');

class RustBattleParser {
  static SOURCE = 'rustbattle';

  constructor() {
    this.headers = {
      'accept': '*/*',
      'accept-language': 'en',
      'authorization': 'Bearer oat_NzcyNzg.c3FvTEJxMlRJV2lHV1pfaDZZc3RZeXdUcFlIU2VZWTlvWlA0NkxmajQ4NzUyNDE1MQ',
      'cache-control': 'no-cache',
      'origin': 'https://rustbattle.com',
      'pragma': 'no-cache',
      'priority': 'u=1, i',
      'referer': 'https://rustbattle.com/',
      'sec-ch-ua': '"Not A(Brand";v="8", "Chromium";v="132", "YaBrowser";v="25.2", "Yowser";v="2.5"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-site',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 YaBrowser/25.2.0.0 Safari/537.36'
    };
  }

  async parse() {
    try {
      const { data } = await axios.get('https://api.rustbattle.com/steam/marketplace?search&sort=price&sortDirection=desc', {
        headers: this.headers,
        timeout: 10000
      });

      // Count stock by grouping items with the same name
      const stockMap = new Map();
      data.items.forEach(item => {
        const count = stockMap.get(item.name) || 0;
        stockMap.set(item.name, count + 1);
      });

      // Process items and remove duplicates
      const uniqueItems = [];
      const processedNames = new Set();

      data.items.forEach(item => {
        if (!processedNames.has(item.name)) {
          uniqueItems.push({
            name: item.name.trim(),
            price: Math.round(item.price * 100), // Convert dollars to cents
            stock: stockMap.get(item.name).toString(),
            source: RustBattleParser.SOURCE,
            rawData: item
          });
          processedNames.add(item.name);
        }
      });

      return uniqueItems;
    } catch (error) {
      console.error('RustBattleParser error:', error.message);
      throw new Error(`Ошибка парсинга RustBattle: ${error.message}`);
    }
  }
}

module.exports = new RustBattleParser();