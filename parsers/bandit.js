const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

class BanditCampParser {
  static SOURCE = 'bandit.camp';

  constructor() {
    this.config = {
      steam: {
        username: 'stematablepasra',
        password: 'fKs-L3W-jUa-S4S',
        expectedProfileUrl: 'https://steamcommunity.com/profiles/76561199840063569'
      },
      steamLoginUrls: {
        main: 'https://steamcommunity.com/login/home/',
        openId: 'https://steamcommunity.com/openid/login?openid.claimed_id=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0%2Fidentifier_select&openid.identity=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0%2Fidentifier_select&openid.mode=checkid_setup&openid.ns=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0&openid.realm=https%3A%2F%2Fapi.banditauth.com&openid.return_to=https%3A%2F%2Fapi.banditauth.com%2Fauth%2Freturn'
      },
      banditcamp: {
        baseUrl: 'https://bandit.camp',
        wsUrl: 'wss://api.bandit.camp/'
      }
    };
  }

  async log(message) {
    console.log(`[${new Date().toISOString()}] ${message}`);
  }

  async setupBrowser() {
    this.log('Запуск браузера в скрытом режиме...');
    return await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-extensions',
        '--disable-gpu',
        '--disable-dev-shm-usage'
      ],
      ignoreHTTPSErrors: true,
      timeout: 120000 // Увеличенный таймаут запуска
    });
  }

    async loginToSteam(page) {
    this.log('Авторизация в Steam...');
    await page.goto(this.config.steamLoginUrls.main, { 
      waitUntil: 'networkidle2', 
      timeout: 60000 
    });

    if (!page.url().includes(this.config.steam.expectedProfileUrl)) {
      await page.waitForSelector('input[type="text"]', { timeout: 30000 });
      await page.type('input[type="text"]', this.config.steam.username, { delay: 50 });
      
      await page.waitForSelector('input[type="password"]', { timeout: 10000 });
      await page.type('input[type="password"]', this.config.steam.password, { delay: 50 });
      
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }),
        page.click('button[type="submit"]')
      ]);
      
      if (await page.$('#captcha')) {
        throw new Error('Обнаружена капча! Требуется ручной ввод.');
      }
    }
    this.log('Авторизация в Steam успешна');
  }

  async openIdLogin(page) {
    this.log('OpenID авторизация...');
    try {
      await page.goto(this.config.steamLoginUrls.openId, {
        waitUntil: 'domcontentloaded',
        timeout: 120000
      });

      // Ждем появления кнопки с несколькими попытками
      let submitButtonFound = false;
      for (let attempt = 1; attempt <= 5; attempt++) {
        try {
          await page.waitForSelector('input[type="submit"]', { timeout: 10000 });
          submitButtonFound = true;
          break;
        } catch (error) {
          this.log(`Попытка ${attempt}: кнопка не найдена, перезагрузка...`);
          await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
        }
      }

      if (!submitButtonFound) {
        throw new Error('Не удалось найти кнопку авторизации OpenID после 5 попыток');
      }

      // Увеличенный таймаут для навигации после клика
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 180000 }),
        page.click('input[type="submit"]')
      ]);

      if (!page.url().includes(this.config.banditcamp.baseUrl)) {
        throw new Error(`Не удалось перенаправиться на ${this.config.banditcamp.baseUrl}`);
      }
      this.log('OpenID авторизация успешна');
    } catch (error) {
      this.log(`Ошибка OpenID авторизации: ${error.message}`);
      throw error;
    }
  }

  async setupWebSocketMonitor(page) {
    this.log('Подключение к WebSocket...');
    const cdp = await page.target().createCDPSession();
    await cdp.send('Network.enable');
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Таймаут ожидания данных инвентаря'));
      }, 60000);

      cdp.on('Network.webSocketFrameReceived', ({ response }) => {
        try {
          const parsed = JSON.parse(response.payloadData);
          if (parsed.i === 8 && Array.isArray(parsed.d)) {
            clearTimeout(timeout);
            this.log(`Получено ${parsed.d.length} предметов`);
            resolve(parsed.d.map(item => ({
              name: item.name.trim(),
              price: item.price,
              stock: item.count,
              inStock: item.inStock,
              source: BanditCampParser.SOURCE,
              rawData: item
            })));
          }
        } catch {}
      });
    });
  }

  async clickWalletButton(page) {
    this.log('Открытие кошелька...');
    await page.waitForSelector('button.v-btn.green700', { timeout: 15000 });
    await page.click('button.v-btn.green700');
  }

  async clickWithdrawButton(page) {
    this.log('Открытие раздела Withdraw...');
    await page.waitForSelector('div.v-list-item__content div.v-list-item__title', { timeout: 15000 });
    const buttons = await page.$$('div.v-list-item__content div.v-list-item__title');
    
    for (const button of buttons) {
      const text = await button.evaluate(el => el.textContent);
      if (text.trim() === 'Withdraw') {
        await button.click();
        return;
      }
    }
    
    throw new Error('Кнопка Withdraw не найдена');
  }

  async parse() {
    let browser;
    try {
      browser = await this.setupBrowser();
      const page = await browser.newPage();
      
      // Настройка страницы
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
      await page.setRequestInterception(true);
      page.on('request', request => request.continue());

      await this.loginToSteam(page);
      await this.openIdLogin(page);
      
      await this.clickWalletButton(page);
      await new Promise(resolve => setTimeout(resolve, 2000));
      await this.clickWithdrawButton(page);
      
      const inventory = await this.setupWebSocketMonitor(page);
      this.log(`Парсинг завершен успешно. Получено ${inventory.length} предметов`);
      return inventory;
    } catch (error) {
      this.log(`Ошибка парсинга: ${error.message}`);
      throw error;
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }
}

module.exports = new BanditCampParser();