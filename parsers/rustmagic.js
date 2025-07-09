const axios = require('axios');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const tough = require('tough-cookie');
const { wrapper } = require('axios-cookiejar-support');

// Конфигурация
const config = {
    steam: {
        username: 'stematablepasra',
        password: 'fKs-L3W-jUa-S4S',
        expectedProfileUrl: 'https://steamcommunity.com/profiles/76561199840063569'
    },
    rustMagic: {
        baseUrl: 'https://api.rustmagic.com',
        marketEndpoint: '/api/skinsdrip/market',
        withdrawUrl: 'https://rustmagic.com/withdraw/rust',
        itemsPerPage: 30,
        sort: 'high-to-low'
    },
    steamLoginUrls: {
        main: 'https://steamcommunity.com/login/home/',
        openId: 'https://steamcommunity.com/openid/login?openid.mode=checkid_setup&openid.ns=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0&openid.identity=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0%2Fidentifier_select&openid.claimed_id=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0%2Fidentifier_select&openid.return_to=https%3A%2F%2Fapi.rustmagic.com%2Fapi%2Fauth%2Fsteam%2Fauthenticate&openid.realm=https%3A%2F%2Fapi.rustmagic.com'
    },
    output: {
        directory: './output',
        filename: 'rustmagic_items.json',
        screenshots: false,
        cookiesFile: 'rustmagic_cookies.json'
    },
    timeouts: {
        request: 30000,
        betweenRequests: 1000,
        navigation: 60000,
        element: 30000,
        betweenPages: 3000
    },
    retries: {
        request: 3,
        pageLoad: 3,
        elementAction: 2
    },
    headers: {
        'accept': 'application/json, text/plain, */*',
        'accept-language': 'ru,en;q=0.9',
        'origin': 'https://rustmagic.com',
        'referer': 'https://rustmagic.com/',
        'sec-ch-ua': '"Not A(Brand";v="8", "Chromium";v="132", "YaBrowser";v="25.2", "Yowser";v="2.5"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-site',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 YaBrowser/25.2.0.0 Safari/537.36'
    }
};

class RustMagicAPIParser {
    constructor() {
        this.currentPage = 0;
        this.totalPages = 1;
        this.rawItems = [];
        this.finalItems = [];
        this.isParsing = false;
        this.startTime = null;
        this.browser = null;
        this.page = null;
        this.cookieJar = new tough.CookieJar();
        
        // Настройка axios с поддержкой cookie
        this.httpClient = wrapper(axios.create({
            baseURL: config.rustMagic.baseUrl,
            timeout: config.timeouts.request,
            headers: config.headers,
            withCredentials: true,
            jar: this.cookieJar
        }));
        
        console.log('[✓] HTTP клиент инициализирован с поддержкой кук');
    }

    reset() {
        this.currentPage = 0;
        this.totalPages = 1;
        this.rawItems = [];
        this.finalItems = [];
        this.isParsing = false;
        this.startTime = null;
        console.log('[✓] Состояние парсера сброшено');
    }

    async initializeBrowser() {
        console.log('[1] Инициализация браузера...');
        try {
            this.browser = await puppeteer.launch({
                headless: 'new',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-web-security',
                    '--disable-features=IsolateOrigins,site-per-process'
                ],
                defaultViewport: null,
                ignoreHTTPSErrors: true
            });

            this.page = await this.browser.newPage();
            await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
            await this.page.setViewport({ width: 1280, height: 800 });

            await this.page.setRequestInterception(true);
            this.page.on('request', request => {
                request.continue();
            });

            console.log('[✓] Браузер успешно инициализирован');
        } catch (error) {
            console.error('[×] Ошибка инициализации браузера:', error);
            throw error;
        }
    }

    async loadCookies() {
        try {
            const cookiesPath = path.join(config.output.directory, config.output.cookiesFile);
            if (fs.existsSync(cookiesPath)) {
                const cookiesJSON = fs.readFileSync(cookiesPath, 'utf8');
                const cookies = JSON.parse(cookiesJSON);
                
                for (const cookie of cookies) {
                    await this.cookieJar.setCookie(
                        `${cookie.name}=${cookie.value}`,
                        config.rustMagic.baseUrl,
                        { path: cookie.path, secure: cookie.secure }
                    );
                }
                
                console.log('[✓] Куки успешно загружены из файла');
                return true;
            }
        } catch (error) {
            console.error('[×] Ошибка загрузки кук:', error);
        }
        return false;
    }

    async saveCookies() {
        try {
            if (!fs.existsSync(config.output.directory)) {
                fs.mkdirSync(config.output.directory, { recursive: true });
            }

            const cookiesPath = path.join(config.output.directory, config.output.cookiesFile);
            const cookies = await this.cookieJar.getCookies(config.rustMagic.baseUrl);
            const serializableCookies = cookies.map(cookie => ({
                name: cookie.key,
                value: cookie.value,
                domain: cookie.domain,
                path: cookie.path,
                expires: cookie.expires,
                secure: cookie.secure
            }));

            fs.writeFileSync(cookiesPath, JSON.stringify(serializableCookies, null, 2));
            console.log('[✓] Куки успешно сохранены');
        } catch (error) {
            console.error('[×] Ошибка сохранения кук:', error);
        }
    }

    async loginToSteam() {
        console.log('\n[2] Авторизация в Steam...');
        try {
            console.log(`Переход на ${config.steamLoginUrls.main}...`);
            await this.page.goto(config.steamLoginUrls.main, {
                waitUntil: 'networkidle2',
                timeout: config.timeouts.navigation
            });

            console.log('Текущий URL:', this.page.url());
            
            if (this.page.url().includes(config.steam.expectedProfileUrl)) {
                console.log('[✓] Уже авторизованы в Steam');
                return;
            }

            console.log('Заполнение формы входа...');
            await this.page.waitForSelector('input[type="text"]', { timeout: config.timeouts.element });
            await this.page.waitForSelector('input[type="password"]', { timeout: config.timeouts.element });

            await this.page.type('input[type="text"]', config.steam.username, { delay: 100 });
            await this.page.type('input[type="password"]', config.steam.password, { delay: 100 });

            console.log('Нажатие кнопки входа...');
            await Promise.all([
                this.page.waitForNavigation({
                    waitUntil: 'networkidle2',
                    timeout: config.timeouts.navigation
                }),
                this.page.click('button[type="submit"]')
            ]);

            console.log('Текущий URL:', this.page.url());

            if (!this.page.url().includes(config.steam.expectedProfileUrl)) {
                if (await this.page.$('#captcha')) {
                    throw new Error('Обнаружена капча. Требуется ручной ввод.');
                }
                throw new Error(`Авторизация не удалась. Ожидался URL содержащий ${config.steam.expectedProfileUrl}`);
            }

            console.log('[✓] Успешная авторизация в Steam');
        } catch (error) {
            console.error('[×] Ошибка авторизации в Steam:', error);
            throw error;
        }
    }

    async steamOpenIdLogin() {
        console.log('\n[3] Авторизация через OpenID...');
        try {
            console.log(`Переход на ${config.steamLoginUrls.openId}...`);
            await this.page.goto(config.steamLoginUrls.openId, {
                waitUntil: 'networkidle2',
                timeout: config.timeouts.navigation
            });

            console.log('Ожидание кнопки Sign In...');
            await this.page.waitForSelector('input[type="submit"]', { timeout: config.timeouts.element });

            console.log('Нажатие кнопки...');
            await Promise.all([
                this.page.waitForNavigation({
                    waitUntil: 'networkidle2',
                    timeout: config.timeouts.navigation
                }),
                this.page.click('input[type="submit"]')
            ]);

            console.log('Текущий URL:', this.page.url());

            if (!this.page.url().includes('rustmagic.com')) {
                throw new Error('Не удалось перенаправиться на rustmagic.com');
            }

            // Получаем куки из браузера
            const browserCookies = await this.page.cookies();
            for (const cookie of browserCookies) {
                await this.cookieJar.setCookie(
                    `${cookie.name}=${cookie.value}`,
                    config.rustMagic.baseUrl,
                    { path: cookie.path, secure: cookie.secure }
                );
            }

            console.log('[✓] Успешная авторизация через OpenID');
        } catch (error) {
            console.error('[×] Ошибка OpenID:', error);
            throw error;
        }
    }

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async startFullProcess() {
        try {
            // Пытаемся загрузить сохраненные куки
            const cookiesLoaded = await this.loadCookies();
            
            if (!cookiesLoaded) {
                // Если куки не загружены, выполняем полный процесс авторизации
                await this.initializeBrowser();
                await this.loginToSteam();
                await this.steamOpenIdLogin();
                await this.saveCookies();
                await this.browser.close();
            }

            await this.parseRustMagic();
            await this.saveResults();
            console.log('[✓] Процесс успешно завершен!');
        } catch (error) {
            console.error('[×] Критическая ошибка:', error);
            throw error;
        } finally {
            if (this.browser) {
                await this.browser.close();
            }
        }
    }

    async makeRequest(url, params = {}, retries = config.retries.request) {
        for (let i = 0; i < retries; i++) {
            try {
                const response = await this.httpClient.get(url, { params });
                return response.data;
            } catch (error) {
                if (i === retries - 1) {
                    if (error.response && error.response.status === 401) {
                        console.log('[!] Сессия устарела, пытаемся обновить куки...');
                        await this.refreshSession();
                        return this.makeRequest(url, params, retries);
                    }
                    throw error;
                }
                console.log(`Повторная попытка запроса (${i + 1}/${retries})...`);
                await this.delay(config.timeouts.betweenRequests);
            }
        }
    }

    async refreshSession() {
        try {
            console.log('[!] Обновление сессии...');
            await this.initializeBrowser();
            await this.loginToSteam();
            await this.steamOpenIdLogin();
            await this.saveCookies();
            await this.browser.close();
            console.log('[✓] Сессия успешно обновлена');
        } catch (error) {
            console.error('[×] Ошибка обновления сессии:', error);
            throw error;
        }
    }

    async parseRustMagic() {
        this.reset();
        console.log('\n[4] Парсинг RustMagic через API...');
        this.isParsing = true;
        this.startTime = new Date();

        try {
            // Сначала получаем первую страницу, чтобы узнать общее количество страниц
            const firstPageData = await this.fetchPage(0);
            this.totalPages = firstPageData.maxPage;
            console.log(`Всего страниц: ${this.totalPages}`);

            // Парсим оставшиеся страницы
            for (let page = 1; page <= this.totalPages; page++) {
                await this.fetchPage(page);
            }

            this.processItems();
            this.showResults();
            this.isParsing = false;
        } catch (error) {
            console.error('[×] Ошибка парсинга:', error);
            throw error;
        }
    }

    async fetchPage(page) {
        console.log(`\n=== Страница ${page + 1}/${this.totalPages + 1} ===`);
        try {
            const params = {
                query: '',
                min: 0,
                max: 'Infinity',
                page: page,
                sort: config.rustMagic.sort
            };

            const data = await this.makeRequest(config.rustMagic.marketEndpoint, params);
            
            if (!data.inventory) {
                throw new Error('Некорректный ответ API: отсутствует inventory');
            }

            console.log(`Найдено элементов: ${data.inventory.length}`);

            data.inventory.forEach(item => {
                if (!item.name || !item.price) {
                    console.warn('Пропущен элемент с неполными данными:', item);
                    return;
                }

                this.rawItems.push({
                    name: item.name.replace(/\s+/g, ' ').trim(),
                    price: item.price,
                    rawPrice: item.rawPrice || null,
                    image: item.image,
                    assetid: item.assetid,
                    source: 'rustmagic.com',
                    page: page,
                    timestamp: new Date().toISOString()
                });
            });

            console.log(`Всего собрано элементов: ${this.rawItems.length}`);
            return data;
        } catch (error) {
            console.error(`[×] Ошибка парсинга страницы ${page}:`, error);
            throw error;
        }
    }

    processItems() {
        console.log('Обработка данных...');
        const itemsMap = new Map();

        this.rawItems.forEach(item => {
            const key = `${item.name}_${item.price}`;
            if (itemsMap.has(key)) {
                itemsMap.get(key).count++;
            } else {
                itemsMap.set(key, {
                    name: item.name,
                    price: item.price,
                    rawPrice: item.rawPrice,
                    image: item.image,
                    assetid: item.assetid,
                    count: 1,
                    source: item.source
                });
            }
        });

        this.finalItems = Array.from(itemsMap.values()).map(item => ({
            name: item.name,
            price: item.price,
            rawPrice: item.rawPrice,
            image: item.image,
            assetid: item.assetid,
            stock: item.count,
            source: item.source,
            lastUpdated: new Date().toISOString()
        }));

        console.log('[✓] Данные обработаны');
    }

    async saveResults() {
        try {
            console.log('\nСохранение результатов...');
            if (!fs.existsSync(config.output.directory)) {
                fs.mkdirSync(config.output.directory, { recursive: true });
            }

            const outputPath = path.join(config.output.directory, config.output.filename);
            const result = {
                metadata: {
                    timestamp: new Date().toISOString(),
                    pagesParsed: this.currentPage + 1,
                    totalPages: this.totalPages + 1,
                    executionTime: `${((new Date() - this.startTime) / 1000).toFixed(1)} сек`
                },
                stats: {
                    totalItems: this.rawItems.length,
                    uniqueItems: this.finalItems.length
                },
                items: this.finalItems,
                rawData: this.rawItems
            };

            fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
            console.log(`[✓] Результаты сохранены в: ${outputPath}`);
        } catch (error) {
            console.error('[×] Ошибка сохранения:', error);
            throw error;
        }
    }

    showResults() {
        const timeSpent = (new Date() - this.startTime) / 1000;
        console.log('\n=== РЕЗУЛЬТАТЫ ПАРСИНГА ===');
        console.log(`Спарсено страниц: ${this.currentPage + 1}/${this.totalPages + 1}`);
        console.log(`Найдено уникальных предметов: ${this.finalItems.length}`);
        console.log(`Общее количество предметов: ${this.rawItems.length}`);
        console.log(`Затрачено времени: ${timeSpent.toFixed(1)} сек`);
        
        if (this.finalItems.length > 0) {
            console.log('\nПримеры предметов:');
            for (let i = 0; i < Math.min(5, this.finalItems.length); i++) {
                const item = this.finalItems[i];
                console.log(`${item.name} - $${(item.price / 100).toFixed(2)} (${item.stock} шт)`);
            }
        }
    }

    async parse() {
        try {
            await this.startFullProcess();
            return this.finalItems.map(item => ({
                name: item.name,
                price: item.price,
                rawPrice: item.rawPrice,
                stock: item.stock.toString(),
                source: 'rustmagic.com',
                image: item.image,
                assetid: item.assetid,
                rawData: item
            }));
        } catch (error) {
            console.error('RustMagicAPIParser error:', error.message);
            throw new Error(`Ошибка парсинга RustMagic: ${error.message}`);
        }
    }
}

// Создаем экземпляр парсера
const rustMagicAPIParser = new RustMagicAPIParser();

// Экспортируем только экземпляр
module.exports = rustMagicAPIParser;

// Для тестирования при прямом запуске
if (require.main === module) {
    (async () => {
        try {
            const result = await rustMagicAPIParser.parse();
            console.log('Парсинг успешен. Найдено предметов:', result.length);
            process.exit(0);
        } catch (error) {
            console.error('Ошибка парсинга:', error);
            process.exit(1);
        }
    })();
}