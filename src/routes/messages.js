const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/auth");
const messageController = require("../controllers/messageController");

// POST send message, GET fetch message history
router.post("/:conversationId", authenticate, messageController.sendMessage);
router.get("/:conversationId", authenticate, messageController.getMessages);

router.post("/:messageId/read", authenticate, messageController.markAsRead);
router.get(
  "/:messageId/reads",
  authenticate,
  messageController.getReadReceipts,
);

module.exports = router;
