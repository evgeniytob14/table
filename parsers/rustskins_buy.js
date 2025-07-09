const axios = require('axios');

class RustSkinsBuyOrdersParser {
  static SOURCE = 'rustskins-buy-orders';

  constructor() {
    this.API_KEY = '68a6b5e7-2059-4214-8233-99f43638b060';
    this.APP_ID = 252490; // ID Rust в Steam
  }

  async parse() {
    try {
      const { data } = await axios.get(`https://api.rustskins.com/external/buy-orders/data/${this.APP_ID}`, {
        timeout: 10000,
        headers: {
          'accept': 'application/json',
          'Authorization': `Bearer ${this.API_KEY}`
        }
      });
      
      return data.map(item => ({
        name: item.item.trim(),
        price: Math.round(item.price * 100), // Конвертация в центы
        stock: `${item.count}`,
        source: RustSkinsBuyOrdersParser.SOURCE,
        type: 'buy-order', // Добавляем тип для удобства фильтрации
        rawData: item
      }));
    } catch (error) {
      console.error('RustSkinsBuyOrdersParser error:', error.message);
      throw new Error(`Ошибка парсинга buy-orders с RustSkins: ${error.message}`);
    }
  }
}

module.exports = new RustSkinsBuyOrdersParser();