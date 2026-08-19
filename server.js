require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const supabase = require('./config/supabase'); 

const deckRoutes = require('./routes/deckRoutes');
const flashcardRoutes = require('./routes/flashcardRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use('/api/decks', deckRoutes);
app.use('/api/cards', flashcardRoutes);

app.get('/', (req, res) => {
    res.json({ message: 'Server Flashcard đang chạy ngon lành!' });
});

// ==========================================
// TỰ CODE CHAY BOT BẰNG FETCH NATIVE (KHÔNG XÀI THƯ VIỆN CŨ)
// ==========================================
const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

// Hàm lõi tự bắn API Telegram
async function sendTelegramMessage(text) {
    try {
        const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: text, parse_mode: 'Markdown' })
        });
        const data = await response.json();
        if (!data.ok) {
            console.error("Lỗi từ Telegram API:", data);
        } else {
            console.log("Đã gửi tin nhắn Telegram thành công!");
        }
    } catch (err) {
        console.error("Lỗi mạng khi gọi Telegram:", err.message);
    }
}

// 1. Lập lịch tự động (Báo thức 8h sáng & 8h tối)
cron.schedule('0 8,20 * * *', async () => {
    try {
        const now = new Date().toISOString();
        const { count } = await supabase.from('tuvung').select('*', { count: 'exact', head: true }).lte('thoi_gian_on_tiep', now);
        
        if (count > 0) {
            sendTelegramMessage(`⏰ Báo thức tự động: Tới giờ ôn tập rồi Hiếu ơi! Có *${count} từ* đang chờ.`);
        }
    } catch (err) {
        console.log("Lỗi cron job:", err.message);
    }
});

// 2. Thay vì gõ /check trong Telegram (đòi hỏi code lắng nghe phức tạp), mình làm một cái API để test
app.get('/api/test-bot', async (req, res) => {
    try {
        const now = new Date().toISOString();
        const { count } = await supabase.from('tuvung').select('*', { count: 'exact', head: true }).lte('thoi_gian_on_tiep', now);
        
        if (count > 0) {
            sendTelegramMessage(`🔥 Test bot: Đang có *${count} từ* tới hạn.\n\nLên trình tiếng Anh Level 3 lẹ lẹ còn chuẩn bị mượt mà cho dự án UniMate AI nữa! 🚀`);
        } else {
            sendTelegramMessage(`✅ Ông đã học sạch sẽ từ vựng! Cứ thoải mái cắm auto đi farm bạc Albion tiếp đi! ⚔️`);
        }
        res.json({ message: "Đã bắn lệnh qua Telegram, check điện thoại ngay!" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ==========================================

app.listen(PORT, () => {
    console.log(`Server khởi động tại http://localhost:${PORT}`);
});