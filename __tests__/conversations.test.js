const request = require("supertest");
const { app, createTestUser, loginUser, getAuthCookie } = require("./setup");

describe("Conversation Endpoints", () => {
  let userA_Cookies, userB_Cookies;
  let userA_ID, userB_ID;

  // before all tests, create two test users and log them in to get their auth cookies and IDs
  beforeAll(async () => {
    await createTestUser("convo-a@test.com", "convoUserA", "Password123!");
    await createTestUser("convo-b@test.com", "convoUserB", "Password123!");

    const loginA = await loginUser("convo-a@test.com", "Password123!");
    userA_Cookies = loginA.cookies;
    userA_ID = loginA.body.data?.user?.id || loginA.body.user?.id;

    const loginB = await loginUser("convo-b@test.com", "Password123!");
    userB_Cookies = loginB.cookies;
    userB_ID = loginB.body.data?.user?.id || loginB.body.user?.id;
  });

  describe("POST /api/conversations", () => {
    test("creates a conversation with valid participants", async () => {
      const res = await request(app)
        .post("/api/conversations")
        .set("Cookie", getAuthCookie(userA_Cookies))
        .send({ participantIds: [userB_ID], isGroup: false });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty("id");
      expect(res.body.data.is_group).toBe(false);
    });

    test("returns 401 without auth", async () => {
      const res = await request(app)
        .post("/api/conversations")
        .send({ participantIds: [userB_ID], isGroup: false });

      expect(res.status).toBe(401);
    });

    test("returns 400 with invalid participant IDs", async () => {
      const res = await request(app)
        .post("/api/conversations")
        .set("Cookie", getAuthCookie(userA_Cookies))
        .send({ participantIds: [], isGroup: false });

      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/conversations", () => {
    test("returns user conversations with participants", async () => {
      const res = await request(app)
        .get("/api/conversations")
        .set("Cookie", getAuthCookie(userA_Cookies));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data[0]).toHaveProperty("participants");
    });
  });
});
