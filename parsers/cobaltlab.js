const axios = require('axios');

class CobaltLabParser {
  static SOURCE = 'cobaltlab';

  constructor() {
    this.headers = {
      'accept': '*/*',
      'accept-language': 'ru,en;q=0.9',
      'baggage': 'sentry-environment=production,sentry-public_key=74d29488cd51a2ddd9e84adc324a5aa1,sentry-trace_id=e616c6729161447886a56365fc60cbd6,sentry-transaction=contacts,sentry-sampled=true,sentry-sample_rand=0.4700006785376851,sentry-sample_rate=1',
      'buildv': '1.0.0',
      'cache-control': 'no-cache',
      'cookie': 'cc=RU; lang=ru; _ga=GA1.1.2049197757.1738870113; _gcl_au=1.1.1468047941.1738870114; _ym_uid=1738870114845529799; _ym_d=1738870114; AMP_MKTG_bb1a34d44b=JTdCJTdE; intercom-id-wbbg5s1m=e0cdde6a-5bc2-40ca-a161-4406a52b54c8; intercom-device-id-wbbg5s1m=a0f1b89b-e443-4739-b836-95ce5b4506a5; _ym_isad=2; intercom-session-wbbg5s1m=; session=766031; sessionKey=220532b05ef550f781ba011903542587; _iidt=byrXsefIDvcHEyuETzFpueWJwI7v7oXGzUBkTWTV1muYTQKFvuLwZG9D4w1Ap+sKZwdS8y9T1eiKHw==; _vid_t=HhsfOG8Tih+WGyRMCAfDfKkBN40sfPHmoNosxfBAjqQRKUBBcpEjvaoC78o1sE51tiQPQ/4Uagy1hw==; AMP_bb1a34d44b=JTdCJTIyZGV2aWNlSWQlMjIlM0ElMjJiODQyMTc2Mi0xOWIyLTQyM2EtYjVlOS1lODlmNzgxODg5ZDclMjIlMkMlMjJzZXNzaW9uSWQlMjIlM0ExNzQ2MTM3NDczNTUzJTJDJTIyb3B0T3V0JTIyJTNBZmFsc2UlMkMlMjJsYXN0RXZlbnRUaW1lJTIyJTNBMTc0NjEzNzYwNDkwOCUyQyUyMmxhc3RFdmVudElkJTIyJTNBMTAlMkMlMjJwYWdlQ291bnRlciUyMiUzQTMlN0Q=; _ga_DV8FVYMQ3J=GS1.1.1746137471.4.1.1746137676.0.0.0',
      'pragma': 'no-cache',
      'priority': 'u=1, i',
      'referer': 'https://cobaltlab.tech/contacts',
      'sec-ch-ua': '"Not A(Brand";v="8", "Chromium";v="132", "YaBrowser";v="25.2", "Yowser";v="2.5"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
      'sentry-trace': 'e616c6729161447886a56365fc60cbd6-b120c51c4e36beff-1',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 YaBrowser/25.2.0.0 Safari/537.36'
    };
  }

  async parse() {
    try {
      const { data } = await axios.get('https://cobaltlab.tech/api/steam/withdraw/inventoryGet?operatorID=1', {
        headers: this.headers,
        timeout: 10000
      });

      if (data.status !== 'success') {
        throw new Error('Неверный статус ответа от сервера');
      }

      return data.data.map(item => {
        return {
          name: item.name.trim(),
          price: item.price, // цена уже в центах
          stock: item.count.toString(),
          source: CobaltLabParser.SOURCE,
          rawData: item
        };
      });
    } catch (error) {
      console.error('CobaltLabParser error:', error.message);
      throw new Error(`Ошибка парсинга CobaltLab: ${error.message}`);
    }
  }
}

module.exports = new CobaltLabParser();