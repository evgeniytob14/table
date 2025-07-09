const axios = require('axios');

class RustSkinsParser {
  static SOURCE = 'rustskins';

  constructor() {
    // API ключ для авторизации (можно вынести в конфиг)
    this.API_KEY = '68a6b5e7-2059-4214-8233-99f43638b060';
  }

  async parse() {
    try {
      const { data } = await axios.get('https://api.rustskins.com/external/marketplace/data/252490', {
        timeout: 10000,
        headers: {
          'accept': 'application/json',
          'Authorization': `Bearer ${this.API_KEY}`
        }
      });
      
      return data.map((item) => {
        return {
          name: item.item.trim(), // Используем поле 'item' как название
          price: Math.round(item.price * 100), // Конвертируем доллары в центы
          stock: `${item.count}`, // Количество как строка
          source: RustSkinsParser.SOURCE,
          rawData: item // Все исходные данные
        };
      });
    } catch (error) {
      console.error('RustSkinsParser error:', error.message);
      throw new Error(`Ошибка парсинга RustSkins: ${error.message}`);
    }
  }
}

module.exports = new RustSkinsParser();