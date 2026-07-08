const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/auth");
const conversationController = require("../controllers/conversationController");

// POST / - Create a new conversation (requires authentication)
router.post("/", authenticate, conversationController.createConversation);

// GET / - List all conversations for the authenticated user
router.get("/", authenticate, conversationController.listConversations);

module.exports = router;
