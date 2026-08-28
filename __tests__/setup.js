const { app, httpServer, io } = require("../src/server");
const { pool } = require("../src/config/db");
const request = require("supertest");

let serverUrl;
let server;

// before all tests, start the server and get the URL
beforeAll(async () => {
  await new Promise((resolve) => {
    server = httpServer.listen(0, () => {
      const port = server.address().port;
      serverUrl = `http://localhost:${port}`;
      resolve();
    });
  });
});

// after all tests, close the server and database connection
afterAll(async () => {
  io.close();
  server.close();
  await pool.end();
});

// helper function to create a test user
async function createTestUser(email, username, password) {
  const res = await request(app)
    .post("/api/auth/register")
    .send({ email, username, password });
  return res.body;
}

// helper function to login a test user and get the auth cookie
async function loginUser(email, password) {
  const res = await request(app)
    .post("/api/auth/login")
    .send({ email, password });
  const cookies = res.headers["set-cookie"];
  return { cookies, body: res.body };
}

// helper function to extract the auth cookie from the response
function getAuthCookie(cookies) {
  if (!cookies) return "";
  const accessCookie = cookies.find((cookie) =>
    cookie.startsWith("accessToken="),
  );
  return accessCookie || "";
}

module.exports = {
  app,
  getServerUrl: () => serverUrl, // function to get the server URL
  createTestUser,
  loginUser,
  getAuthCookie,
  io,
};
