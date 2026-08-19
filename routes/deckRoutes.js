const express = require('express');
const router = express.Router();
const deckController = require('../controllers/deckController');

router.post('/', deckController.createDeck);
router.get('/', deckController.getDecks);
router.delete('/:id', deckController.deleteDeck); // Thêm dòng này

module.exports = router;