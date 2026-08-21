const express = require('express');
const router = express.Router();
const flashcardController = require('../controllers/flashcardController');

router.post('/import', flashcardController.importFromQuizlet);
router.get('/review-all', flashcardController.getAllWordsToReview); // <--- THÊM DÒNG NÀY Ở ĐÂY
router.get('/review/:id_hocphan', flashcardController.getWordsToReview);
router.post('/review', flashcardController.reviewCard);

module.exports = router;