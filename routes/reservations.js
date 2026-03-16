const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Import các Schema (Hãy điều chỉnh đường dẫn và tên biến nếu schema của bạn đặt tên khác)
const Reservation = require('../schemas/reservations'); 
const Cart = require('../schemas/cart');
const Product = require('../schemas/products');

// Middleware giả lập lấy userId (Trong thực tế, bạn sẽ lấy từ token qua middleware auth)
// Tạm thời gán cứng 1 ID để test, bạn hãy thay bằng req.user._id sau này
const getUserId = (req) => "USER_ID_CUA_BAN_O_DAY"; 

// ==========================================
// CÁC HÀM GET (Không cần Transaction)
// ==========================================

// 1. get all cua user -> GET /
router.get('/', async (req, res) => {
    try {
        const userId = getUserId(req);
        const reservations = await Reservation.find({ user: userId });
        res.status(200).json({ success: true, data: reservations });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 2. get 1 cua user -> GET /:id
router.get('/:id', async (req, res) => {
    try {
        const userId = getUserId(req);
        const reservation = await Reservation.findOne({ _id: req.params.id, user: userId });
        
        if (!reservation) {
            return res.status(404).json({ success: false, message: "Không tìm thấy reservation" });
        }
        res.status(200).json({ success: true, data: reservation });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==========================================
// CÁC HÀM POST (BẮT BUỘC DÙNG TRANSACTION)
// ==========================================

// 3. reserveACart -> POST /reserveACart
router.post('/reserveACart', async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction(); // BẮT ĐẦU TRANSACTION

    try {
        const userId = getUserId(req);

        // B1: Lấy giỏ hàng của user
        const cart = await Cart.findOne({ user: userId }).session(session);
        if (!cart || cart.items.length === 0) {
            throw new Error("Giỏ hàng trống!");
        }

        // B2: Tạo Reservation từ cart items
        const newReservation = new Reservation({
            user: userId,
            items: cart.items,
            status: 'pending' // Trạng thái mặc định
        });
        await newReservation.save({ session });

        // B3: Xóa hoặc làm rỗng giỏ hàng
        await Cart.findOneAndUpdate(
            { user: userId }, 
            { $set: { items: [] } }, // Clear mảng items
            { session }
        );

        await session.commitTransaction(); // LƯU THÀNH CÔNG
        res.status(201).json({ success: true, message: "Đặt hàng từ giỏ hàng thành công", data: newReservation });

    } catch (error) {
        await session.abortTransaction(); // HOÀN TÁC NẾU LỖI
        res.status(400).json({ success: false, message: "Lỗi tạo reservation, đã rollback: " + error.message });
    } finally {
        session.endSession(); // Đóng session
    }
});

// 4. reserveItems -> POST /reserveItems
router.post('/reserveItems', async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction(); // BẮT ĐẦU TRANSACTION

    try {
        const userId = getUserId(req);
        const { items } = req.body; // Expect: { "items": [ { "product": "id_1", "quantity": 2 } ] }

        if (!items || !Array.isArray(items) || items.length === 0) {
            throw new Error("Vui lòng cung cấp danh sách sản phẩm hợp lệ");
        }

        // B1: Có thể thêm logic kiểm tra tồn kho (Inventory) ở đây nếu cần thiết
        // ... (tìm Product và kiểm tra số lượng) ...

        // B2: Tạo Reservation trực tiếp
        const newReservation = new Reservation({
            user: userId,
            items: items, // Gắn list product và quantity vào
            status: 'pending'
        });
        await newReservation.save({ session });

        await session.commitTransaction(); // LƯU THÀNH CÔNG
        res.status(201).json({ success: true, message: "Đặt sản phẩm thành công", data: newReservation });

    } catch (error) {
        await session.abortTransaction(); // HOÀN TÁC NẾU LỖI
        res.status(400).json({ success: false, message: "Lỗi, đã rollback: " + error.message });
    } finally {
        session.endSession();
    }
});

// ==========================================
// HÀM CANCEL (CŨNG DÙNG TRANSACTION)
// ==========================================

// 5. cancelReserve -> POST /cancelReserve/:id
// Đề bài: "cancel phải để trong transaction" -> Hàm này PHẢI dùng transaction
router.post('/cancelReserve/:id', async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction(); // BẮT ĐẦU TRANSACTION

    try {
        const userId = getUserId(req);
        
        const updatedReservation = await Reservation.findOneAndUpdate(
            { _id: req.params.id, user: userId },
            { status: 'cancelled' },
            { new: true, session }
        );

        if (!updatedReservation) {
            throw new Error("Không tìm thấy hoặc không thể hủy");
        }

        await session.commitTransaction(); // LƯU THÀNH CÔNG
        res.status(200).json({ success: true, message: "Đã hủy thành công", data: updatedReservation });
    } catch (error) {
        await session.abortTransaction(); // HOÀN TÁC NẾU LỖI
        res.status(500).json({ success: false, message: error.message });
    } finally {
        session.endSession(); // Đóng session
    }
});

module.exports = router;