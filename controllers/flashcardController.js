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
                // Dùng Regex quét xem chuỗi tiếng Việt có bắt đầu bằng ngoặc đơn chứa chữ không
                const posMatch = vie.match(/^(\([^)]+\))\s*(.*)$/);
                if (posMatch) {
                    eng = eng + ' ' + posMatch[1]; // Bê nguyên cái ngoặc nối vào từ tiếng Anh
                    vie = posMatch[2];             // Giữ lại phần nghĩa thuần Việt
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

// 2. Lấy các từ tới hạn ôn theo từng học phần
exports.getWordsToReview = async (req, res) => {
    try {
        const { id_hocphan } = req.params;
        const now = new Date().toISOString();

        const { data, error } = await supabase
            .from('tuvung')
            .select('*')
            .eq('id_hocphan', id_hocphan)
            .lte('thoi_gian_on_tiep', now);

        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 3. Logic Spaced Repetition khi bấm Nhớ / Quên
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
        let nextTime = new Date();

        if (is_remembered) {
            nextLevel = currentWord.level_hien_tai + 1;
            // Công thức giãn cách: Lv1 = +1 ngày, Lv2 = +3 ngày, Lv3 = +7 ngày, Lv4+ = +14 ngày
            const daysToAdd = nextLevel === 1 ? 1 : nextLevel === 2 ? 3 : nextLevel === 3 ? 7 : 14;
            nextTime.setDate(nextTime.getDate() + daysToAdd);
        } else {
            nextLevel = 0;
            // Quên thì về Level 0 và ôn lại sau 12 tiếng
            nextTime.setHours(nextTime.getHours() + 12);
        }

        const { data, error } = await supabase
            .from('tuvung')
            .update({
                level_hien_tai: nextLevel,
                thoi_gian_on_tiep: nextTime.toISOString()
            })
            .eq('id', id_tuvung)
            .select();

        if (error) throw error;
        res.json({ message: 'Đã cập nhật tiến độ ôn tập', data: data[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};