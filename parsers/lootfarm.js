const axios = require('axios');

class LootFarmParser {
  static SOURCE = 'lootfarm';
  
  async parse() {
    try {
      const { data } = await axios.get('https://loot.farm/fullpriceRUST.json', {
        timeout: 10000
      });
      
      return data.map(item => ({
        name: item.name.trim(),
        price: Math.round(item.price * 1), // Конвертируем в центы
        stock: `${item.have}/${item.max}`,
        source: LootFarmParser.SOURCE,
        rawData: item // Для отладки
      }));
    } catch (error) {
      console.error('LootFarmParser error:', error.message);
      throw new Error(`Ошибка парсинга Loot.farm: ${error.message}`);
    }
  }
}

module.exports = new LootFarmParser();