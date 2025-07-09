const axios = require('axios');

class JabkaParser {
  static SOURCE = 'jabka';

  async parse() {
    try {
      const { data } = await axios.get('https://jabka.skin/cdn/items/252490.json', {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': 'https://jabka.skin/'
        }
      });
      
      return data.items.map(item => {
        return {
          name: item.marketName.trim(),
          price: Math.round(parseFloat(item.price) * 100),
          stock: item.stock.toString(),
          source: JabkaParser.SOURCE,
          rawData: item
        };
      });
    } catch (error) {
      console.error('JabkaParser error:', error.message);
      throw new Error(`Ошибка парсинга Jabka: ${error.message}`);
    }
  }
}

module.exports = new JabkaParser();