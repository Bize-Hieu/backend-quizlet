const supabase = require('../config/supabase');

// 1. Lấy danh sách học phần (ĐÃ FIX: Thuật toán 3 trạng thái Đỏ, Vàng, Xanh chuẩn giờ VN)
exports.getDecks = async (req, res) => {
    try {
        // Query kéo học phần và toàn bộ ID, hạn ôn của từ vựng bên trong
        const { data: decks, error } = await supabase
            .from('hocphan')
            .select('id, ten_hocphan, tuvung(id, thoi_gian_on_tiep)');

        if (error) throw error;

        // Xử lý múi giờ VN (UTC+7) cho chính xác, không dùng giờ quốc tế của Server
        const nowUTC = new Date();
        const nowVN = new Date(nowUTC.getTime() + (7 * 60 * 60 * 1000)); 
        const twoDaysLaterVN = new Date(nowVN.getTime() + (48 * 60 * 60 * 1000));

        // Xử lý phân loại dữ liệu trả về cho Frontend
        const result = decks.map(deck => {
            const listTuVung = deck.tuvung || [];
            const tong_so_tu = listTuVung.length; 
            
            let tu_do = 0, tu_vang = 0, tu_xanh = 0;

            listTuVung.forEach(tu => {
                // Đề phòng data lỗi (chưa có thời gian ôn), vứt luôn vào nhóm Đỏ bắt học ngay
                if (!tu.thoi_gian_on_tiep) {
                    tu_do++;
                    return;
                }

                const reviewTime = new Date(tu.thoi_gian_on_tiep);
                // Chuyển giờ Database (UTC) sang giờ VN để so sánh chuẩn xác
                const reviewTimeVN = new Date(reviewTime.getTime() + (7 * 60 * 60 * 1000));

                if (reviewTimeVN <= nowVN) {
                    tu_do++; // Trễ hạn hoặc tới hạn
                } else if (reviewTimeVN <= twoDaysLaterVN) {
                    tu_vang++; // Trong vòng 48h tới
                } else {
                    tu_xanh++; // Xa hơn 48h
                }
            });

            return {
                id: deck.id,
                ten_hocphan: deck.ten_hocphan,
                tong_so_tu: tong_so_tu,
                tu_do: tu_do,
                tu_vang: tu_vang,
                tu_xanh: tu_xanh
            };
        });

        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// 2. Tạo học phần mới
exports.createDeck = async (req, res) => {
    try {
        const { ten_hocphan } = req.body;
        if (!ten_hocphan) return res.status(400).json({ error: 'Tên học phần không được để trống' });

        const { data, error } = await supabase
            .from('hocphan')
            .insert([{ ten_hocphan }])
            .select();

        if (error) throw error;
        res.status(201).json(data[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// 3. Xóa học phần (kèm xóa sạch từ vựng)
exports.deleteDeck = async (req, res) => {
    try {
        const { id } = req.params;

        // Xóa từ vựng trước (Ràng buộc khóa ngoại)
        await supabase.from('tuvung').delete().eq('id_hocphan', id);

        // Xóa học phần
        const { error } = await supabase.from('hocphan').delete().eq('id', id);
        if (error) throw error;

        res.json({ message: 'Đã xóa học phần thành công!' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};