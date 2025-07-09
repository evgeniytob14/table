const axios = require('axios');
require('dotenv').config();

class TelegramService {
    static async sendMessage(message) {
        try {
            const token = process.env.TELEGRAM_BOT_TOKEN;
            const chatId = process.env.TELEGRAM_CHAT_ID;
            
            if (!token || !chatId) {
                console.error('Telegram credentials not configured');
                return;
            }

            await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
                chat_id: chatId,
                text: message,
                parse_mode: 'HTML'
            });
        } catch (error) {
            console.error('Error sending Telegram message:', error.message);
        }
    }
}

module.exports = TelegramService;