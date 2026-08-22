require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const supabase = require('./config/supabase'); 

// 1. THÊM THƯ VIỆN GEMINI VÀO ĐÂY
const { GoogleGenerativeAI } = require('@google/generative-ai');

const deckRoutes = require('./routes/deckRoutes');
const flashcardRoutes = require('./routes/flashcardRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ==========================================
// 2. KHỞI TẠO BỘ NÃO AI (GEMINI 2.5 FLASH)
// ==========================================
// Nhớ phải có dòng GEMINI_API_KEY=AIzaSy... trong file .env nhé, cấm để lộ thiên
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// 3. MIDDLEWARE: Bơm AI vào mọi Request để file Route khác xài ké
app.use((req, res, next) => {
    req.aiModel = model;
    next();
});
// ==========================================

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
const frontendUrl = "https://bize-hieu.github.io/FRONTEND-QUIZLET/"; 

async function sendTelegramMessage(text, showButton = false) {
    try {
        const payload = {
            chat_id: chatId,
            text: text,
            parse_mode: 'Markdown'
        };

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

// HÀM TRUY VẤN TỐI ƯU FSRS (CÁI SỐ 2 VÀ 3 GỘP HẾT VÀO ĐÂY)
async function scanAndNotifyFSRS() {
    try {
        const now = new Date().toISOString();

        // 1. Quét thẻ QUÊN / ĐANG HỌC DỞ (State 1 & 3)
        const { count: urgentCount } = await supabase
            .from('tuvung')
            .select('*', { count: 'exact', head: true })
            .lte('thoi_gian_on_tiep', now)
            .in('state', [1, 3]);

        // 2. Quét thẻ ÔN ĐỊNH KỲ (State 2)
        const { count: reviewCount } = await supabase
            .from('tuvung')
            .select('*', { count: 'exact', head: true })
            .lte('thoi_gian_on_tiep', now)
            .eq('state', 2);

        // 3. Quét thẻ MỚI TINH (State 0)
        const { count: newCount } = await supabase
            .from('tuvung')
            .select('*', { count: 'exact', head: true })
            .eq('state', 0);

        const totalDue = (urgentCount || 0) + (reviewCount || 0);

        if (totalDue > 0) {
            let msg = `🧠 **BÁO CÁO NÃO BỘ FSRS**\n\n`;
            
            if (urgentCount > 0) {
                msg += `⚠️ *Cấp bách (Sắp quên):* ${urgentCount} thẻ\n`;
            }
            if (reviewCount > 0) {
                msg += `📖 *Ôn định kỳ:* ${reviewCount} thẻ\n`;
            }
            if (newCount > 0) {
                msg += `✨ *Từ mới chưa đụng:* ${newCount} thẻ\n`;
            }

            msg += `\nLên trình lẹ lẹ còn chuẩn bị cho dự án nữa! 🚀\nTổng cộng cần xử lý: *${totalDue} thẻ*.`;

            sendTelegramMessage(msg, true);
        } else {
            sendTelegramMessage(`✅ Sạch sẽ không còn từ nào nợ! Cứ thoải mái cắm auto hoặc vác Rìu Chiến đi solo farm bạc tiếp đi! ⚔️`);
        }
    } catch (err) {
        console.error("Lỗi tối ưu truy vấn FSRS:", err.message);
    }
}

// 1. Lập lịch tự động (8h, 12h, 16h, 20h) giờ VN , 0 1 5 9 13 là giờ của Mẽo
cron.schedule('0 1,5,9,13 * * *', () => {
    scanAndNotifyFSRS();
});

// 2. API Test Bot rút gọn cực kỳ sạch sẽ
app.get('/api/test-bot', async (req, res) => {
    try {
        await scanAndNotifyFSRS();
        res.json({ message: "Đã bắn lệnh test qua Telegram, check điện thoại ngay!" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ==========================================

app.listen(PORT, () => {
    console.log(`Server khởi động tại http://localhost:${PORT}`);
});