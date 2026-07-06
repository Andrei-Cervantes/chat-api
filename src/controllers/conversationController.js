const { pool } = require("../config/db");

exports.createConversation = async (req, res) => {
  const { title, participantIds, isGroup } = req.body;
  const userId = req.user.id;

  // Validate that participantIds is a non-empty array
  if (
    !participantIds ||
    !Array.isArray(participantIds) ||
    participantIds.length === 0
  ) {
    return res.status(400).json({
      success: false,
      error: { message: "participantIds must be a non-empty array" },
    });
  }

  // Ensure current user is included in participants
  const allParticipants = [...new Set([userId, ...participantIds])];

  // Direct conversations must have exactly 2 participants
  if (!isGroup && allParticipants.length !== 2) {
    return res.status(400).json({
      success: false,
      error: {
        message: "Direct conversations must have exactly 2 participants",
      },
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Insert the conversation record
    const conversationResult = await client.query(
      "INSERT INTO conversations (title, is_group) VALUES ($1, $2) RETURNING *",
      [isGroup ? title : null, isGroup || false],
    );
    const conversation = conversationResult.rows[0];

    // Add all participants to the conversation
    for (const participantId of allParticipants) {
      await client.query(
        "INSERT INTO participants (conversation_id, user_id) VALUES ($1, $2)",
        [conversation.id, participantId],
      );
    }

    await client.query("COMMIT");

    // Join connected participants to the new conversation room and notify them
    const io = req.app.get("io");
    for (const participantId of allParticipants) {
      const sockets = await io.in(`user:${participantId}`).fetchSockets();
      sockets.forEach((s) => s.join(`conversation:${conversation.id}`));
      io.to(`user:${participantId}`).emit("conversation:created", conversation);
    }

    res.status(201).json({ success: true, data: conversation });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error creating conversation:", err);
    res.status(500).json({
      success: false,
      error: { message: "Failed to create conversation" },
    });
  } finally {
    client.release();
  }
};
