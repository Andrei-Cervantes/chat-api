const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const { pool } = require("../config/db");

function setupSocket(io) {
  // Parse cookies for each incoming connection
  io.engine.use(cookieParser());

  // Authentication middleware for Socket.IO
  io.use((socket, next) => {
    const token = socket.request.cookies?.accessToken;
    if (!token) {
      return next(new Error("Authentication error"));
    }

    try {
      const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
      socket.user = decoded;
      next();
    } catch (err) {
      next(new Error("Authentication error"));
    }
  });

  // Log every new WebSocket connection
  io.on("connection", async (socket) => {
    console.log("User connected:", socket.id);

    // Join user-specific room for direct notifications
    socket.join(`user:${socket.user.id}`);

    // Auto-join user to their conversation rooms
    try {
      const result = await pool.query(
        "SELECT conversation_id FROM user_conversations WHERE user_id = $1",
        [socket.user.id],
      );
      result.rows.forEach((row) => {
        socket.join(`conversation:${row.conversation_id}`);
      });
      console.log(
        `User ${socket.user.id} joined ${result.rows.length} conversation rooms`,
      );
    } catch (err) {
      console.error("Error joining rooms:", err);
    }

    // Log user disconnect
    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
    });
  });

  return io;
}

module.exports = { setupSocket };
