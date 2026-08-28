const { pool } = require("../config/db");

exports.sendMessage = async (req, res) => {
  const { conversationId } = req.params;
  const { content, messageType } = req.body || {};
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

exports.getMessages = async (req, res) => {
  const { conversationId } = req.params;
  const userId = req.user.id;
  const { limit = 50, before } = req.query;

  try {
    // Verify user is a participant
    const participantCheck = await pool.query(
      "SELECT id FROM participants WHERE conversation_id = $1 AND user_id = $2",
      [conversationId, userId],
    );

    if (participantCheck.rows.length === 0) {
      return res.status(403).json({
        success: false,
        error: { message: "You are not a participant in this conversation" },
      });
    }

    // Build query with optional cursor-based pagination
    let query = `
      SELECT m.*, json_build_object('id', u.id, 'username', u.username, 'avatar_url', u.avatar_url) as sender
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.conversation_id = $1`;
    const params = [conversationId];

    if (before) {
      query += ` AND m.created_at < $${params.length + 1}`;
      params.push(before);
    }

    query += ` ORDER BY m.created_at DESC LIMIT $${params.length + 1}`;
    params.push(parseInt(limit));

    const result = await pool.query(query, params);

    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("Error fetching messages:", err);
    res.status(500).json({
      success: false,
      error: { message: "Failed to fetch messages" },
    });
  }
};
