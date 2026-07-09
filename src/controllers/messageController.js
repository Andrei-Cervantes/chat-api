const { pool } = require("../config/db");

exports.sendMessage = async (req, res) => {
  const { conversationId } = req.params;
  const { content, messageType } = req.body;
  const senderId = req.user.id;

  // Validate message content
  if (!content || content.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: { message: "Message content is required" },
    });
  }

  try {
    // Verify user is a participant in this conversation
    const participantCheck = await pool.query(
      "SELECT id FROM participants WHERE conversation_id = $1 AND user_id = $2",
      [conversationId, senderId],
    );

    if (participantCheck.rows.length === 0) {
      return res.status(403).json({
        success: false,
        error: { message: "You are not a participant in this conversation" },
      });
    }

    // Insert message into database
    const result = await pool.query(
      `INSERT INTO messages (conversation_id, sender_id, content, message_type)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [conversationId, senderId, content.trim(), messageType || "text"],
    );
    const message = result.rows[0];

    // Update conversation timestamp so it sorts to the top
    await pool.query(
      "UPDATE conversations SET updated_at = NOW() WHERE id = $1",
      [conversationId],
    );

    // Fetch sender info for the broadcast payload
    const senderResult = await pool.query(
      "SELECT id, username, avatar_url FROM users WHERE id = $1",
      [senderId],
    );
    const sender = senderResult.rows[0];

    // Broadcast to all connected participants in this conversation room
    const io = req.app.get("io");
    io.to(`conversation:${conversationId}`).emit("message:new", {
      ...message,
      sender,
    });

    res.status(201).json({ success: true, data: message });
  } catch (err) {
    console.error("Error sending message:", err);
    res.status(500).json({
      success: false,
      error: { message: "Failed to send message" },
    });
  }
};
