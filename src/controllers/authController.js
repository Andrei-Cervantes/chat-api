const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { pool } = require("../config/db");
const {
  validateRegistration,
  validateLogin,
} = require("../middleware/validate");

// Generate short-lived JWT token (15 minutes)
const generateAccessToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
    },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: "15m" },
  );
};

// Generate long-lived JWT refresh token (7 days)
const generateRefreshToken = (user) => {
  return jwt.sign({ id: user.id }, process.env.REFRESH_TOKEN_SECRET, {
    expiresIn: "7d",
  });
};

// Set tokens as httpOnly cookies on the response
const setTokenCookies = (res, accessToken, refreshToken) => {
  res.cookie("accessToken", accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict", // prevent cross-site request forgery
    maxAge: 15 * 60 * 1000, // 15 mins
  });
  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
};

// Register function
exports.register = async (req, res) => {
  try {
    const { email, username, password } = req.body;

    // Validate input fields
    const errors = validateRegistration(email, username, password);
    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: { message: errors[0], code: "VALIDATION_ERROR" },
      });
    }

    // Check duplicate email/username before proceeding
    const existingUser = await pool.query(
      "SELECT id FROM users WHERE email = $1 OR username = $2",
      [email, username],
    );
    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: {
          message: "Email or username already exists",
          code: "DUPLICATE_USER",
        },
      });
    }

    // Hash the password with bcrypt (salt rounds: 10)
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Insert the new user into the database
    const result = await pool.query(
      "INSERT INTO users (email, username, password_hash) VALUES ($1, $2, $3) RETURNING id, email, username, created_at",
      [email, username, passwordHash],
    );
    const user = result.rows[0];

    // Generate tokens and store refresh token hash in database
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    await pool.query(
      "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL '7 days')",
      [user.id, refreshTokenHash],
    );

    /// Set cookies and respond with user data
    setTokenCookies(res, accessToken, refreshToken);

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          created_at: user.created_at,
        },
      },
    });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({
      success: false,
      error: { message: "Internal server error", code: "SERVER_ERROR" },
    });
  }
};

// Login function
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // validate input
    const errors = validateLogin(email, password);
    if (errors.lenght > 0) {
      return res.status(400).json({
        success: false,
        error: { message: errors[0], code: "VALIDATION_ERROR" },
      });
    }

    // look up user by email
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);
    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: {
          message: "Invalid credentials",
          code: "INVALID_CREDENTIALS",
        },
      });
    }

    // validate hashed password with stored hash
    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: {
          message: "Invalid credentials",
          code: "INVALID_CREDENTIALS",
        },
      });
    }

    // generate fresh tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // store hashed refresh token
    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    await pool.query(
      "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL \`7 days\`)",
      [user.id, refreshTokenHash],
    );

    // Set cookies and respond
    setTokenCookies(res, accessToken, refreshToken);
    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          created_at: user.created_at,
        },
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({
      success: false,
      error: { message: "Internal server error", code: "SERVER_ERROR" },
    });
  }
};
