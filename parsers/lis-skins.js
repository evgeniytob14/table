const axios = require('axios');

class LISSkinsParser {
  static SOURCE = 'lis-skins';

  async parse() {
    try {
      const { data } = await axios.get('https://lis-skins.com/market_export_json/rust.json', {
        timeout: 10000
      });
      
      return data.map((item) => {
        return {
          name: item.name.trim(),
          price: Math.round(item.price * 100), // Convert dollars to cents
          stock: `${item.count}`,
          source: LISSkinsParser.SOURCE,
          rawData: item
        };
      });
    } catch (error) {
      console.error('LISSkinsParser error:', error.message);
      throw new Error(`Ошибка парсинга LIS-Skins: ${error.message}`);
    }
  }
}

module.exports = new LISSkinsParser();