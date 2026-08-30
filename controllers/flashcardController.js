const supabase = require('../config/supabase');
const { FSRS, Card, Rating } = require('fsrs.js');

// Khởi tạo lõi AI FSRS đúng chuẩn Class
const f = new FSRS();

// 1. Import hàng loạt từ Quizlet (Cũ - giữ nguyên)
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
            return res.status(400).json({ error: 'Không tìm thấy từ vựng hợp lệ nào.' });
        }

        const { data, error } = await supabase.from('tuvung').insert(insertData).select();
        if (error) throw error;

        res.status(201).json({ message: `Đã dọn rác và nhập thành công ${data.length} từ vựng!`, data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 2. Lấy các từ tới hạn ôn (Cũ - giữ nguyên)
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

// 3. THUẬT TOÁN FSRS CHUẨN QUỐC TẾ (Cũ - giữ nguyên)
exports.reviewCard = async (req, res) => {
    try {
        const { id_tuvung, is_remembered } = req.body;
        
        const { data: currentWord, error: fetchErr } = await supabase
            .from('tuvung')
            .select('*')
            .eq('id', id_tuvung)
            .single();

        if (fetchErr || !currentWord) return res.status(404).json({ error: 'Không tìm thấy từ vựng' });

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

        const rating = is_remembered ? Rating.Good : Rating.Again;
        const now = new Date();
        const schedulingCards = f.repeat(card, now);
        const recordLog = schedulingCards[rating];
        const updatedCard = recordLog.card;

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
                thoi_gian_on_tiep: updatedCard.due.toISOString(),
                last_review: updatedCard.last_review ? updatedCard.last_review.toISOString() : now.toISOString()
            })
            .eq('id', id_tuvung)
            .select();

        if (error) throw error;
        res.json({ message: 'Đã tối ưu não bộ', data: data[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 4. LẤY TẤT CẢ TỪ VỰNG CẦN ÔN (Cũ - giữ nguyên)
exports.getAllWordsToReview = async (req, res) => {
    try {
        const nowUTC = new Date();
        const nowVN = new Date(nowUTC.getTime() + (7 * 60 * 60 * 1000));
        const endOfTodayVN = new Date(nowVN);
        endOfTodayVN.setUTCHours(23, 59, 59, 999); 
        const endOfTodayUTC = new Date(endOfTodayVN.getTime() - (7 * 60 * 60 * 1000));

        const { data, error } = await supabase
            .from('tuvung')
            .select('*, hocphan(ten_hocphan)')
            .lte('thoi_gian_on_tiep', endOfTodayUTC.toISOString())
            .neq('state', 0)
            .order('id_hocphan', { ascending: true }) 
            .order('thoi_gian_on_tiep', { ascending: true }); 

        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// =========================================================================
// 5. IMPORT BẰNG AI (UPDATE MỚI: DÙNG JSON, LẤY CÂU MẪU + WORD FORM)
// =========================================================================
exports.importWithAI = async (req, res) => {
    const { raw_text, id_hocphan } = req.body; 

    if (!raw_text || !id_hocphan) {
        return res.status(400).json({ error: 'Thiếu dữ liệu văn bản hoặc chưa chọn học phần!' });
    }

    try {
        // ÉP AI XUẤT JSON CHUẨN CHỈ, VẮT KIỆT WORD FAMILY
const prompt = `
        Tao cung cấp một danh sách từ vựng. Dữ liệu đầu vào có thể XẢY RA 2 TRƯỜNG HỢP: chỉ có Tiếng Anh, hoặc có cả Tiếng Anh lẫn Tiếng Việt (cách nhau bởi khoảng trắng hoặc Tab).
        Nhiệm vụ: Phân tích đầu vào và trả về một mảng JSON thuần túy (không bọc markdown code block).
        
        Mỗi object trong mảng phải có đúng các key sau:
        - "tu_tieng_anh": Từ gốc Tiếng Anh.
        - "nghia_tieng_viet": Nếu đầu vào ĐÃ CÓ nghĩa Tiếng Việt thì bám theo nghĩa đó (có thể gọt giũa lại cho gọn). Nếu đầu vào CHỈ CÓ Tiếng Anh thì mày TỰ DỊCH nghĩa chuẩn xác nhất.
        - "dinh_nghia_anh": 1 câu định nghĩa Anh-Anh dễ hiểu, chuẩn từ điển.
        - "cau_mau": 1 câu ví dụ tiếng Anh thực tế + Dịch nghĩa sang tiếng Việt.
        - "word_form": Liệt kê toàn bộ Word Family. Định dạng: V: [từ] - N: [từ] - Adj: [từ] - Adv: [từ]. Quét sạch các dạng, không có thì bỏ qua.
        
        Danh sách đầu vào:
        ${raw_text}
        `;

        const result = await req.aiModel.generateContent(prompt);
        let responseText = result.response.text();
        
        // Dọn rác markdown nếu con AI nó lanh chanh thêm vào
        responseText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        
        const aiData = JSON.parse(responseText); 
        const cardsToInsert = [];

        for (const item of aiData) {
            cardsToInsert.push({
                id_hocphan: Number(id_hocphan), 
                tu_tieng_anh: item.tu_tieng_anh,
                // Gom Định nghĩa Anh và Nghĩa Việt chung 1 cột bằng dấu | để HTML cũ vẫn chạy tốt
                nghia_tieng_viet: `${item.dinh_nghia_anh} | ${item.nghia_tieng_viet}`, 
                
                // NHÉT THÊM 2 CỘT MỚI VÀO ĐÂY!
                cau_mau: item.cau_mau,
                word_form: item.word_form,
                
                state: 0, 
                stability: 0,
                difficulty: 0,
                elapsed_days: 0,
                scheduled_days: 0,
                reps: 0,
                lapses: 0,
                thoi_gian_on_tiep: new Date().toISOString()
            });
        }

        if (cardsToInsert.length === 0) {
            return res.status(400).json({ error: 'AI không xử lý được hoặc dữ liệu sai cấu trúc.' });
        }

        // Đẩy lên Supabase (nhớ là phải tạo 2 cột cau_mau và word_form bên Supabase rồi nhé)
        const { data, error } = await supabase.from('tuvung').insert(cardsToInsert).select();
        if (error) throw error;

        res.status(201).json({ 
            message: `Ghê chưa, AI đã độ full giáp và nhập thành công ${data.length} từ!`, 
            data 
        });

    } catch (err) {
        console.error('Lỗi API Import AI:', err);
        res.status(500).json({ error: 'Lỗi hệ thống hoặc AI đang ngáo (Hoặc chưa tạo 2 cột bên DB): ' + err.message });
    }
};