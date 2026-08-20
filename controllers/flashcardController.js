const supabase = require('../config/supabase');

// 1. Import hàng loạt từ Quizlet (Bao cân mọi loại rác từ trang In)
exports.importFromQuizlet = async (req, res) => {
    try {
        const { id_hocphan, raw_text } = req.body;
        if (!raw_text || !id_hocphan) {
            return res.status(400).json({ error: 'Thiếu dữ liệu import hoặc id_hocphan' });
        }

        // Tách thành từng dòng
        const lines = raw_text.trim().split('\n');
        const insertData = [];

        for (let line of lines) {
            // Dọn rác 1: Bỏ qua mấy dòng không chứa số thứ tự hoặc không có dấu Tab
            if (!line.match(/^\d+\./) && !line.includes('\t')) continue;

            // Dọn rác 2: Cắt bỏ số thứ tự ở đầu
            let cleanLine = line.replace(/^\d+\.\s*/, '').trim();

            let parts = cleanLine.split('\t'); 

            // Dọn rác 3: Xử lý trường hợp mất Tab
            if (parts.length < 2) {
                const match = cleanLine.match(/^(.*?)\s+(\(.*)$/);
                if (match) parts = [match[1], match[2]];
            }

            if (parts.length >= 2) {
                let eng = parts[0].trim();
                let vie = parts[1].trim();

                // DỌN RÁC 4 (Bổ sung fix lỗi): Trả từ loại (n), (v)... về nhà tiếng Anh
                const posMatch = vie.match(/^(\([^)]+\))\s*(.*)$/);
                if (posMatch) {
                    eng = eng + ' ' + posMatch[1];
                    vie = posMatch[2]; 
                }

                insertData.push({
                    tu_tieng_anh: eng,
                    nghia_tieng_viet: vie,
                    id_hocphan: Number(id_hocphan),
                    level_hien_tai: 0,
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

// 2. Lấy các từ tới hạn ôn (ĐÃ SỬA: Cho phép học toàn bộ bài của ngày hôm nay)
exports.getWordsToReview = async (req, res) => {
    try {
        const { id_hocphan } = req.params;
        
        // Mở cửa lấy thẻ tới tận 23:59:59 của ngày hiện tại (giờ VN)
        const nowUTC = new Date();
        const nowVN = new Date(nowUTC.getTime() + (7 * 60 * 60 * 1000));
        const endOfTodayVN = new Date(nowVN);
        endOfTodayVN.setUTCHours(23, 59, 59, 999); 
        
        // Đẩy về giờ quốc tế cho DB truy vấn
        const endOfTodayUTC = new Date(endOfTodayVN.getTime() - (7 * 60 * 60 * 1000));

        const { data, error } = await supabase
            .from('tuvung')
            .select('*')
            .eq('id_hocphan', id_hocphan)
            .lte('thoi_gian_on_tiep', endOfTodayUTC.toISOString())
            .order('thoi_gian_on_tiep', { ascending: true }); // Ưu tiên những từ nợ cũ lên trước

        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 3. Logic Spaced Repetition (ĐÃ SỬA: Ép thời gian ôn về 00:00:00 giờ sáng)
exports.reviewCard = async (req, res) => {
    try {
        const { id_tuvung, is_remembered } = req.body;
        
        const { data: currentWord, error: fetchErr } = await supabase
            .from('tuvung')
            .select('*')
            .eq('id', id_tuvung)
            .single();

        if (fetchErr || !currentWord) return res.status(404).json({ error: 'Không tìm thấy từ vựng' });

        let nextLevel = 0;
        let nextTimeVN = new Date(new Date().getTime() + (7 * 60 * 60 * 1000)); // Lấy mốc giờ VN

        if (is_remembered) {
            nextLevel = currentWord.level_hien_tai + 1;
            // Công thức giãn cách: Lv1 = +1 ngày, Lv2 = +3 ngày, Lv3 = +7 ngày, Lv4+ = +14 ngày
            const daysToAdd = nextLevel === 1 ? 1 : nextLevel === 2 ? 3 : nextLevel === 3 ? 7 : 14;
            
            // Cộng ngày và ÉP THỜI GIAN VỀ ĐÚNG 00:00:00
            nextTimeVN.setDate(nextTimeVN.getDate() + daysToAdd);
            nextTimeVN.setUTCHours(0, 0, 0, 0); // 0h sáng giờ VN
        } else {
            nextLevel = 0;
            // Quên thì ôn lại sau 12 tiếng (không khóa giờ, vì sai là phải ôn sát sao)
            nextTimeVN.setUTCHours(nextTimeVN.getUTCHours() + 12);
        }

        // Chuyển lại về giờ UTC để ném vào Database
        const nextTimeUTC = new Date(nextTimeVN.getTime() - (7 * 60 * 60 * 1000));

        const { data, error } = await supabase
            .from('tuvung')
            .update({
                level_hien_tai: nextLevel,
                thoi_gian_on_tiep: nextTimeUTC.toISOString()
            })
            .eq('id', id_tuvung)
            .select();

        if (error) throw error;
        res.json({ message: 'Đã cập nhật tiến độ ôn tập', data: data[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};