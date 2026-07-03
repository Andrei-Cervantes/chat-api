require("dotenv").config();
const express = require("express");
const { createServer } = require("node:http");
const { Server } = require("socket.io");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const authRoutes = require("./routes/auth");
const { pool } = require("./config/db");
const { setupSocket } = require("./socket");

const app = express();
// Wrap the Express app in a raw HTTP server so Socket.IO can share the same port
const httpServer = createServer(app);
const PORT = process.env.PORT || 5000;

const corsOptions = {
  origin: process.env.CLIENT_URL || "http://localhost:3000",
  credentials: true,
};

// CORS configuration
app.use(cors(corsOptions));

// Parse JSON Requests and Cookies
app.use(express.json());
app.use(cookieParser());

// Serve static files for test client
app.use(express.static("public"));

// Health check
app.get("/api/health", (req, res) => {
  res.json({ success: true, message: "Server is running" });
});

// Routes
app.use("/api/auth", authRoutes);

// Socket.IO setup
const io = new Server(httpServer, {
  cors: corsOptions,
});

// Store io on the app so controllers can emit events later
app.set("io", io);
setupSocket(io);

// Start the server only if not in test mode
if (process.env.NODE_ENV !== "test") {
  httpServer.listen(PORT, async () => {
    try {
      const client = await pool.connect();
      console.log("Connected to PostgreSQL database");
      client.release();
    } catch (err) {
      console.error("Error connecting to PostgreSQL database:", err);
    }
    console.log(`Server is running on port ${PORT}`);
  });
}

// Export for testing purposes
module.exports = { app, httpServer, io };
