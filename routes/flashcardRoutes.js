const express = require('express');
const router = express.Router();
const flashcardController = require('../controllers/flashcardController');

router.post('/import', flashcardController.importFromQuizlet); // Cũ
router.post('/import-ai', flashcardController.importWithAI); // <--- THÊM CÁI DÒNG AI NÀY VÀO ĐÂY

router.get('/review-all', flashcardController.getAllWordsToReview); 
router.get('/review/:id_hocphan', flashcardController.getWordsToReview);
router.post('/review', flashcardController.reviewCard);

module.exports = router;