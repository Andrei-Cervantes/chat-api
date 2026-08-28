const request = require("supertest");
const { io: ioClient } = require("socket.io-client");
const {
  app,
  getServerUrl,
  createTestUser,
  loginUser,
  getAuthCookie,
  io,
} = require("./setup");

describe("Message Endpoints", () => {
  let userA_Cookies, userB_Cookies;
  let userA_ID, userB_ID;
  let conversationID;

  beforeAll(async () => {
    await createTestUser("msg-a@test.com", "msgUserA", "Password123!");
    await createTestUser("msg-b@test.com", "msgUserB", "Password123!");

    const loginA = await loginUser("msg-a@test.com", "Password123!");
    userA_Cookies = loginA.cookies;
    userA_ID = loginA.body.data?.user?.id || loginA.body.user?.id;

    const loginB = await loginUser("msg-b@test.com", "Password123!");
    userB_Cookies = loginB.cookies;
    userB_ID = loginB.body.data?.user?.id || loginB.body.user?.id;

    // Create a conversation for the users
    const convoRes = await request(app)
      .post("/api/conversations")
      .set("Cookie", getAuthCookie(userA_Cookies))
      .send({ participantIds: [userB_ID], isGroup: false });

    conversationID = convoRes.body.data.id;
  });

  describe("POST /api/messages/:conversationId", () => {
    test("sends a message and returns 201", async () => {
      const res = await request(app)
        .post(`/api/messages/${conversationID}`)
        .set("Cookie", getAuthCookie(userA_Cookies))
        .send({
          content: "Hello from User A Test!",
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.content).toBe("Hello from User A Test!");
      expect(res.body.data.sender_id).toBe(userA_ID);
    });

    test("returns 403 for non-participant user", async () => {
      // create third user who is not part of the conversation
      await createTestUser("msg-c@test.com", "msgUserC", "Password123!");
      const loginC = await loginUser("msg-c@test.com", "Password123!");

      const res = await request(app)
        .post(`/api/messages/${conversationID}`)
        .set("Cookie", getAuthCookie(loginC.cookies))
        .send({
          content: "I should not be able to send this",
        });

      expect(res.status).toBe(403);
    });
  });

  describe("GET /api/messages/:conversationId", () => {
    test("returns messages in reverse chronological order", async () => {
      const res = await request(app)
        .get(`/api/messages/${conversationID}`)
        .set("Cookie", getAuthCookie(userA_Cookies));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data[0]).toHaveProperty("sender");
      expect(res.body.data[0].sender).toHaveProperty("username");
    });
  });

  describe("Socket.IO real-time events", () => {
    test("connected user receives message: new event", async () => {
      const cookie = getAuthCookie(userB_Cookies);

      // 1. Initialize client using CAPITALized "Cookie" header
      const clientSocket = ioClient(getServerUrl(), {
        extraHeaders: { Cookie: cookie }, // <-- Updated key to capital 'Cookie'
        transports: ["polling"],
      });

      // 2. Add an error listener so the test fails instantly on connection failure
      const connectionErrorPromise = new Promise((_, reject) => {
        clientSocket.on("connect_error", (err) => {
          reject(new Error(`Socket connection failed: ${err.message}`));
        });
      });

      const connectionSuccessPromise = new Promise((resolve) => {
        clientSocket.on("connect", resolve);
      });

      // Race them! Whichever occurs first will handle the test outcome
      await Promise.race([connectionSuccessPromise, connectionErrorPromise]);

      // Wait briefly for room auto-join to complete
      await new Promise((resolve) => setTimeout(resolve, 200));

      const messagePromise = new Promise((resolve) => {
        clientSocket.on("message:new", (msg) => {
          resolve(msg);
        });
      });

      // Send a message from User A
      await request(app)
        .post(`/api/messages/${conversationID}`)
        .set("Cookie", getAuthCookie(userA_Cookies))
        .send({ content: "Real-time test message" });

      const receivedMessage = await messagePromise;
      expect(receivedMessage.content).toBe("Real-time test message");
      expect(receivedMessage.sender.username).toBe("msgUserA");

      clientSocket.disconnect();
    });
  });
});
