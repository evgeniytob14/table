const axios = require('axios');

class CSTradeParser {
  static SOURCE = 'cstrade';

  async parse() {
    try {
      const { data } = await axios.get('https://cdn.cs.trade:2096/api/prices_RUST', {
        timeout: 10000
      });
      
      return Object.entries(data).map(([name, item]) => {
        let stock;
        if (item.max > 0) {
          stock = `${item.have}/${item.max}`;
        } else if (item.max === 0) {
          stock = `${item.have}/0`;
        } else {
          stock = `${item.have}`;
        }

        return {
          name: name.trim(),
          price: Math.round(item.price * 100),
          stock: stock,
          source: CSTradeParser.SOURCE,
          rawData: item
        };
      });
    } catch (error) {
      console.error('CSTradeParser error:', error.message);
      throw new Error(`Ошибка парсинга CS.Trade: ${error.message}`);
    }
  }
}

module.exports = new CSTradeParser();