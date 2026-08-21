const supabase = require('../config/supabase');
const { FSRS, Card, Rating } = require('fsrs.js');

// Khởi tạo lõi AI FSRS đúng chuẩn Class
const f = new FSRS();

// 1. Import hàng loạt từ Quizlet (Giữ nguyên, vì DB đã tự gán Default cho 8 cột FSRS)
exports.importFromQuizlet = async (req, res) => {
    try {
        const { id_hocphan, raw_text } = req.body;
        if (!raw_text || !id_hocphan) {
            return res.status(400).json({ error: 'Thiếu dữ liệu import hoặc id_hocphan' });
        }

        const lines = raw_text.trim().split('\n');
        const insertData = [];

        for (let line of lines) {
            if (!line.match(/^\d+\./) && !line.includes('\t')) continue;
            let cleanLine = line.replace(/^\d+\.\s*/, '').trim();
            let parts = cleanLine.split('\t'); 
            
            if (parts.length < 2) {
                const match = cleanLine.match(/^(.*?)\s+(\(.*)$/);
                if (match) parts = [match[1], match[2]];
            }

            if (parts.length >= 2) {
                let eng = parts[0].trim();
                let vie = parts[1].trim();

                const posMatch = vie.match(/^(\([^)]+\))\s*(.*)$/);
                if (posMatch) {
                    eng = eng + ' ' + posMatch[1];
                    vie = posMatch[2]; 
                }

                insertData.push({
                    tu_tieng_anh: eng,
                    nghia_tieng_viet: vie,
                    id_hocphan: Number(id_hocphan),
                    thoi_gian_on_tiep: new Date().toISOString()
                });
            }
        }

        if (insertData.length === 0) {
            return res.status(400).json({ error: 'Không tìm thấy từ vựng hợp lệ nào. Cấu trúc copy bị sai.' });
        }

        const { data, error } = await supabase.from('tuvung').insert(insertData).select();
        if (error) throw error;

        res.status(201).json({ message: `Đã dọn rác và nhập thành công ${data.length} từ vựng!`, data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 2. Lấy các từ tới hạn ôn
exports.getWordsToReview = async (req, res) => {
    try {
        const { id_hocphan } = req.params;
        
        const nowUTC = new Date();
        const nowVN = new Date(nowUTC.getTime() + (7 * 60 * 60 * 1000));
        const endOfTodayVN = new Date(nowVN);
        endOfTodayVN.setUTCHours(23, 59, 59, 999); 
        
        const endOfTodayUTC = new Date(endOfTodayVN.getTime() - (7 * 60 * 60 * 1000));

        const { data, error } = await supabase
            .from('tuvung')
            .select('*')
            .eq('id_hocphan', id_hocphan)
            .lte('thoi_gian_on_tiep', endOfTodayUTC.toISOString())
            .order('thoi_gian_on_tiep', { ascending: true }); 

        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 3. THUẬT TOÁN FSRS CHUẨN QUỐC TẾ
exports.reviewCard = async (req, res) => {
    try {
        const { id_tuvung, is_remembered } = req.body;
        
        // Kéo data thẻ hiện tại từ Supabase
        const { data: currentWord, error: fetchErr } = await supabase
            .from('tuvung')
            .select('*')
            .eq('id', id_tuvung)
            .single();

        if (fetchErr || !currentWord) return res.status(404).json({ error: 'Không tìm thấy từ vựng' });

        // Tái tạo lại Object Card theo form của thư viện FSRS
        const card = new Card();
        card.state = currentWord.state;
        card.stability = currentWord.stability;
        card.difficulty = currentWord.difficulty;
        card.reps = currentWord.reps;
        card.lapses = currentWord.lapses;
        card.elapsed_days = currentWord.elapsed_days;
        card.scheduled_days = currentWord.scheduled_days;
        card.due = currentWord.thoi_gian_on_tiep ? new Date(currentWord.thoi_gian_on_tiep) : new Date();
        card.last_review = currentWord.last_review ? new Date(currentWord.last_review) : undefined;

        // Quy đổi nút bấm Frontend sang Điểm số FSRS (1: Quên, 3: Nhớ)
        const rating = is_remembered ? Rating.Good : Rating.Again;

        // Ép AI FSRS tính toán toàn bộ tương lai của thẻ này
        const now = new Date();
        const schedulingCards = f.repeat(card, now);
        
        // Trích xuất kết quả tương ứng với nút ông vừa bấm
        const recordLog = schedulingCards[rating];
        const updatedCard = recordLog.card;

        // Quăng ngược toàn bộ thông số AI vừa tính toán về lại Database
        const { data, error } = await supabase
            .from('tuvung')
            .update({
                state: updatedCard.state,
                stability: updatedCard.stability,
                difficulty: updatedCard.difficulty,
                reps: updatedCard.reps,
                lapses: updatedCard.lapses,
                elapsed_days: updatedCard.elapsed_days,
                scheduled_days: updatedCard.scheduled_days,
                thoi_gian_on_tiep: updatedCard.due.toISOString(), // Giờ hoàng đạo tới lượt ôn
                last_review: updatedCard.last_review ? updatedCard.last_review.toISOString() : now.toISOString()
            })
            .eq('id', id_tuvung)
            .select();

        if (error) throw error;
        res.json({ message: 'Đã tối ưu não bộ bằng FSRS', data: data[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
// 4. LẤY TẤT CẢ TỪ VỰNG CẦN ÔN (GOM NHÓM THEO HỌC PHẦN)
exports.getAllWordsToReview = async (req, res) => {
    try {
        const nowUTC = new Date();
        const nowVN = new Date(nowUTC.getTime() + (7 * 60 * 60 * 1000));
        const endOfTodayVN = new Date(nowVN);
        endOfTodayVN.setUTCHours(23, 59, 59, 999); 
        const endOfTodayUTC = new Date(endOfTodayVN.getTime() - (7 * 60 * 60 * 1000));

        // Join bảng tuvung với hocphan để lấy cái tên, sau đó sắp xếp theo ID học phần
        const { data, error } = await supabase
            .from('tuvung')
            .select('*, hocphan(ten_hocphan)')
            .lte('thoi_gian_on_tiep', endOfTodayUTC.toISOString())
            .order('id_hocphan', { ascending: true }) // Cái này để gom cụm
            .order('thoi_gian_on_tiep', { ascending: true }); 

        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}
};