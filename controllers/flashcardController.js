const supabase = require('../config/supabase');

// 1. Import hàng loạt từ Quizlet (ĐÃ XÓA level_hien_tai để tương thích DB mới)
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

                // Không cần nhét interval, ease_factor vào đây vì DB đã tự gán Default là 0, 2.5 và 0 rồi
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

// 2. Lấy các từ tới hạn ôn (Cho phép học trước đến 23:59:59 hôm nay)
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

// 3. THUẬT TOÁN SM-2 CHUẨN QUỐC TẾ
exports.reviewCard = async (req, res) => {
    try {
        const { id_tuvung, is_remembered } = req.body;
        
        const { data: currentWord, error: fetchErr } = await supabase
            .from('tuvung')
            .select('*')
            .eq('id', id_tuvung)
            .single();

        if (fetchErr || !currentWord) return res.status(404).json({ error: 'Không tìm thấy từ vựng' });

        // Lấy các chỉ số SM-2 từ DB lên
        let { interval, ease_factor, so_lan_lap } = currentWord;
        let nextTimeVN = new Date(new Date().getTime() + (7 * 60 * 60 * 1000)); 

        if (is_remembered) {
            // NẾU NHỚ: Tăng khoảng cách theo cấp số nhân
            if (so_lan_lap === 0) {
                interval = 1; // Đúng lần đầu -> Mai học lại
            } else if (so_lan_lap === 1) {
                interval = 3; // Đúng lần 2 -> Giãn ra 3 ngày
            } else {
                // Từ lần 3 trở đi: Lấy khoảng cách cũ nhân với Hệ số độ khó (EF)
                interval = Math.round(interval * ease_factor);
            }
            so_lan_lap += 1; // Cộng dồn số lần đúng liên tiếp
            
            // ÉP THỜI GIAN VỀ ĐÚNG 00:00:00 của ngày tương lai
            nextTimeVN.setDate(nextTimeVN.getDate() + interval);
            nextTimeVN.setUTCHours(0, 0, 0, 0); 
        } else {
            // NẾU QUÊN: Phạt hệ số, nhưng không vứt bỏ hoàn toàn
            ease_factor = Math.max(1.3, ease_factor - 0.2); // Chém EF nhưng giữ mức tối thiểu là 1.3
            interval = 0.5; // Ép về nửa ngày (12 tiếng) để vá nơ-ron ngay
            so_lan_lap = 0; // Reset chuỗi trả lời đúng
            
            // Cộng 12 tiếng kể từ thời điểm bấm Quên
            nextTimeVN.setUTCHours(nextTimeVN.getUTCHours() + 12);
        }

        // Chuyển lại về giờ UTC để ném vào Database
        const nextTimeUTC = new Date(nextTimeVN.getTime() - (7 * 60 * 60 * 1000));

        const { data, error } = await supabase
            .from('tuvung')
            .update({
                interval: interval,
                ease_factor: ease_factor,
                so_lan_lap: so_lan_lap,
                thoi_gian_on_tiep: nextTimeUTC.toISOString()
            })
            .eq('id', id_tuvung)
            .select();

        if (error) throw error;
        res.json({ message: 'Đã cập nhật tiến độ SM-2', data: data[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};