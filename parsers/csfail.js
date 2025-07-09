const axios = require('axios');

class SixCsFailParser {
  static SOURCE = '6csfail';

  async parse() {
    try {
      const { data } = await axios.get('https://6cs.fail/cdn/items/252490.json', {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': 'https://6cs.fail/'
        }
      });
      
      return data.items.map(item => {
        return {
          name: item.marketName.trim(),
          price: Math.round(parseFloat(item.priceUsd) * 100), // Конвертируем доллары в центы
          stock: item.stock.toString(),
          source: SixCsFailParser.SOURCE,
          rawData: item
        };
      });
    } catch (error) {
      console.error('SixCsFailParser error:', error.message);
      throw new Error(`Ошибка парсинга 6cs.fail: ${error.message}`);
    }
  }
}

module.exports = new SixCsFailParser();