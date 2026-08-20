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
// TỰ CODE CHAY BOT BẰNG FETCH NATIVE 
// ==========================================
const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;
const frontendUrl = "https://bize-hieu.github.io/FRONTEND-QUIZLET/"; // Link web để bấm phát học luôn

// Hàm lõi tự bắn API Telegram (Hỗ trợ nút bấm Inline Keyboard)
async function sendTelegramMessage(text, showButton = false) {
    try {
        const payload = {
            chat_id: chatId,
            text: text,
            parse_mode: 'Markdown'
        };

        // Nếu có thẻ cần học, nhúng nút bấm mở web
        if (showButton) {
            payload.reply_markup = {
                inline_keyboard: [[{ text: "🚀 Mở App Học Ngay", url: frontendUrl }]]
            };
        }

        const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
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

// 1. Lập lịch tự động (8h, 12h, 16h, 20h - Chuẩn nhịp độ FSRS)
cron.schedule('0 8,12,16,20 * * *', async () => {
    try {
        const now = new Date().toISOString();
        
        // Quét tổng số thẻ tới hạn
        const { count } = await supabase
            .from('tuvung')
            .select('*', { count: 'exact', head: true })
            .lte('thoi_gian_on_tiep', now);
        
        if (count > 0) {
            sendTelegramMessage(`⏰ **Báo thức FSRS:** Tới khung giờ ôn tập rồi!\n\nĐang có *${count} thẻ* rớt đài sắp quên. Cày lẹ đi!`, true);
        }
    } catch (err) {
        console.log("Lỗi cron job:", err.message);
    }
});

// 2. API Test Bot (Nâng cấp)
app.get('/api/test-bot', async (req, res) => {
    try {
        const now = new Date().toISOString();
        
        // Đếm thẻ cần ôn (Đã tới hạn)
        const { count: dueCount } = await supabase
            .from('tuvung')
            .select('*', { count: 'exact', head: true })
            .lte('thoi_gian_on_tiep', now);
            
        // Đếm thẻ mới tinh chưa đụng tới (state = 0)
        const { count: newCount } = await supabase
            .from('tuvung')
            .select('*', { count: 'exact', head: true })
            .eq('state', 0);
        
        if (dueCount > 0) {
            let msg = `🔥 **Cập nhật Hệ Thống:**\n\n`;
            msg += `🔴 Tới hạn cần ôn ngay: *${dueCount} thẻ*\n`;
            msg += `🔵 Thẻ mới chờ khám phá: *${newCount || 0} thẻ*\n\n`;
            msg += `Lên trình tiếng Anh Level 3 lẹ lẹ còn chuẩn bị mượt mà cho dự án UniMate AI nữa! 🚀`;
            
            sendTelegramMessage(msg, true);
        } else {
            sendTelegramMessage(`✅ Sạch sẽ không còn từ nào nợ! Cứ thoải mái cắm auto hoặc vác Rìu Chiến đi solo farm bạc tiếp đi! ⚔️`);
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