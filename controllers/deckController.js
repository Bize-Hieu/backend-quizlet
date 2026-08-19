const supabase = require('../config/supabase');

// 1. Lấy danh sách học phần (ĐÃ FIX: Đếm cả tổng số từ và số từ cần ôn)
exports.getDecks = async (req, res) => {
    try {
        // Query kéo học phần và toàn bộ ID, hạn ôn của từ vựng bên trong
        const { data: decks, error } = await supabase
            .from('hocphan')
            .select('id, ten_hocphan, tuvung(id, thoi_gian_on_tiep)');

        if (error) throw error;

        const now = new Date();

        // Xử lý dữ liệu trả về cho Frontend
        const result = decks.map(deck => {
            const listTuVung = deck.tuvung || [];
            
            // 1. Đếm tổng số từ đang có trong học phần
            const tong_so_tu = listTuVung.length; 
            
            // 2. Đếm số từ đã tới hạn cần ôn
            const so_tu_can_on = listTuVung.filter(tu => new Date(tu.thoi_gian_on_tiep) <= now).length; 

            return {
                id: deck.id,
                ten_hocphan: deck.ten_hocphan,
                tong_so_tu: tong_so_tu,     // Ném biến này về để Frontend nhận diện rỗng/đầy
                so_tu_can_on: so_tu_can_on
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

        // Xóa từ vựng trước
        await supabase.from('tuvung').delete().eq('id_hocphan', id);

        // Xóa học phần
        const { error } = await supabase.from('hocphan').delete().eq('id', id);
        if (error) throw error;

        res.json({ message: 'Đã xóa học phần thành công!' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};