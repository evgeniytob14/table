const axios = require('axios');

class SkincadeParser {
  static SOURCE = 'skincade';
  static PAGE_LIMIT = 60; // Лимит предметов на странице (как в API)

  constructor() {
    this.session = axios.create({
      baseURL: 'https://api.skincade.com',
      timeout: 30000, // Увеличим таймаут для множественных запросов
      headers: {
        'authority': 'api.skincade.com',
        'accept': 'application/json',
        'accept-encoding': 'gzip, deflate, br, zstd',
        'accept-language': 'ru,en;q=0.9',
        'cache-control': 'no-cache',
        'origin': 'https://skincade.com',
        'pragma': 'no-cache',
        'priority': 'u=1, i',
        'referer': 'https://skincade.com/',
        'sec-ch-ua': '"Not A(Brand";v="8", "Chromium";v="132", "YaBrowser";v="25.2", "Yowser";v="2.5"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-site',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 YaBrowser/25.2.0.0 Safari/537.36'
      }
    });

    this.session.interceptors.request.use(config => {
      config.headers.Cookie = `AuthSession=s%3AWyOrLLGL2eHE8BsBKnHRFx26ODXBziBK.LSf71pYLd12ssR8kbPOm5MLDYSEfCDGMnrB9D1jvg0U; ph_phc_LCvxRngZglPJrW1tupnagrmBVEUkMs9F0c4i9GMqC9Z_posthog=%7B%22distinct_id%22%3A%22681ae68d314337b9b39f5f5e%22%2C%22%24sesid%22%3A%5B1746593504014%2C%220196a913-20dc-7a10-a4c9-6de1470106ce%22%2C1746593325276%5D%2C%22%24session_is_sampled%22%3Atrue%2C%22%24epp%22%3Atrue%2C%22%24initial_person_info%22%3A%7B%22r%22%3A%22https%3A%2F%2Fskinspoint.com%2F%22%2C%22u%22%3A%22https%3A%2F%2Fskincade.com%2F%3Fr%3DBET%22%7D%7D`;
      return config;
    });
  }

  async fetchPage(skip = 0) {
    try {
      const { data } = await this.session.post('/cashier/withdraw/skinsback/inventory/get-many', {
        data: { appId: "252490" },
        metadata: {
          query: {
            filter: [{ type: "range", field: "price" }],
            pagination: { limit: SkincadeParser.PAGE_LIMIT, skip },
            sort: { field: "price", order: "DESC" }
          }
        }
      });
      
      return {
        items: data.data.inventory,
        total: data.metadata.pagination.total,
        skip: data.metadata.pagination.skip,
        limit: data.metadata.pagination.limit
      };
    } catch (error) {
      console.error(`Ошибка при получении страницы (skip=${skip}):`, error.message);
      throw error;
    }
  }

  async parse() {
    try {
      let allItems = [];
      let skip = 0;
      let totalItems = null;
      let attempt = 0;
      const MAX_ATTEMPTS = 3;

      console.log('Начало парсинга Skincade с пагинацией...');
      
      do {
        attempt++;
        try {
          const { items, total } = await this.fetchPage(skip);
          
          if (totalItems === null) {
            totalItems = total;
            console.log(`Всего предметов для парсинга: ${totalItems}`);
          }

          allItems = [...allItems, ...items];
          skip += items.length;
          console.log(`Получено ${items.length} предметов (всего: ${allItems.length}/${totalItems})`);

          // Сброс счетчика попыток после успешного запроса
          attempt = 0;

          // Добавим небольшую задержку между запросами
          if (skip < totalItems) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        } catch (error) {
          if (attempt >= MAX_ATTEMPTS) {
            console.error(`Не удалось получить данные после ${MAX_ATTEMPTS} попыток`);
            throw error;
          }
          console.log(`Повторная попытка (${attempt}/${MAX_ATTEMPTS})...`);
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      } while (skip < totalItems);

      console.log(`Парсинг завершен. Получено ${allItems.length} предметов`);

      return allItems.map(item => ({
        name: item.name.trim(),
        price: item.price,
        stock: `${item.amount}`,
        source: SkincadeParser.SOURCE,
        rawData: item
      }));

    } catch (error) {
      console.error('SkincadeParser error:', error.message);
      throw new Error(`Ошибка парсинга Skincade: ${error.message}`);
    }
  }
}

module.exports = new SkincadeParser();