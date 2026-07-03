function setupSocket(io) {
  // Log every new WebSocket connection
  io.on("connection", (socket) => {
    console.log("New connection:", socket.id);
  });
  return io;
}

module.exports = { setupSocket };
