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
const generateRefreshToken = (user, familyId) => {
  return jwt.sign(
    { id: user.id, family: familyId },
    process.env.REFRESH_TOKEN_SECRET,
    {
      expiresIn: "7d",
    },
  );
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

// Register controller
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
    const familyID = require("crypto").randomUUID(); // Generate a unique family ID for the user
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user, familyID);

    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    await pool.query(
      "INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at) VALUES ($1, $2, $3, NOW() + INTERVAL '7 days')",
      [user.id, refreshTokenHash, familyID],
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

// Login controller
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // validate input
    const errors = validateLogin(email, password);
    if (errors.length > 0) {
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
    const familyId = require("crypto").randomUUID(); // Generate a unique family ID for the user
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user, familyId);

    // store hashed refresh token
    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    await pool.query(
      "INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at) VALUES ($1, $2, $3, NOW() + INTERVAL '7 days')",
      [user.id, refreshTokenHash, familyId],
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

// Logout controller
exports.logout = async (req, res) => {
  try {
    // Remove the refresh token from the database
    await pool.query("DELETE FROM refresh_tokens WHERE user_id = $1", [
      req.user.id,
    ]);

    // Clear token cookies
    res.clearCookie("accessToken");
    res.clearCookie("refreshToken");

    res.json({ success: true, message: "Logged out successfully" });
  } catch (err) {
    console.error("Logout error:", err);
    return res.status(500).json({
      success: false,
      error: { message: "Internal server error", code: "SERVER_ERROR" },
    });
  }
};

// Get current user controller
exports.getMe = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, email, username, avatar_url, created_at FROM users WHERE id = $1",
      [req.user.id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { message: "User not found", code: "USER_NOT_FOUND" },
      });
    }

    res.json({
      success: true,
      data: { user: result.rows[0] },
    });
  } catch (err) {
    console.error("GetMe error:", err);
    res.status(500).json({
      success: false,
      error: { message: "Internal server error", code: "SERVER_ERROR" },
    });
  }
};

// Refresh token controller
exports.refresh = async (req, res) => {
  try {
    // Read refresh token from cookie
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        error: { message: "No refresh token provided", code: "NO_TOKEN" },
      });
    }

    // verify token signature and expiry
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
    } catch (err) {
      return res.status(401).json({
        success: false,
        error: { message: "Invalid refresh token", code: "INVALID_TOKEN" },
      });
    }

    const familyId = decoded.family;

    // Detect Theft - check if any token in this family has been revoked
    const revokedCheck = await pool.query(
      "SELECT * FROM refresh_tokens WHERE family_id = $1 AND is_revoked = TRUE",
      [familyId],
    );

    if (revokedCheck.rows.length > 0) {
      // Revoke all tokens in this family
      await pool.query("DELETE FROM refresh_tokens WHERE user_id = $1", [
        decoded.id,
      ]);
      res.clearCookie("accessToken");
      res.clearCookie("refreshToken");
      return res.status(401).json({
        success: false,
        error: {
          message: "Token reuse detected. All sessions revoked.",
          code: "TOKEN_THEFT",
        },
      });
    }

    // Find valid (non-expired) refresh tokens for this user
    const storedTokens = await pool.query(
      "SELECT * FROM refresh_tokens WHERE user_id = $1 AND expires_at > NOW()",
      [decoded.id],
    );

    // Compare provided token against stored hashes
    let validToken = null;
    for (const stored of storedTokens.rows) {
      const isMatch = await bcrypt.compare(refreshToken, stored.token_hash);

      if (isMatch) {
        validToken = stored;
        break;
      }
    }

    if (!validToken) {
      return res.status(401).json({
        success: false,
        error: {
          message: "Refresh token not recognized",
          code: "TOKEN_NOT_FOUND",
        },
      });
    }

    // Rotation: Mark old token as revoked (consumed)
    await pool.query(
      "UPDATE refresh_tokens SET is_revoked = TRUE WHERE id = $1",
      [validToken.id],
    );

    // Look up user and issue new access token
    const user = await pool.query(
      "SELECT id, email, username FROM users WHERE id = $1",
      [decoded.id],
    );
    if (user.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: { message: "User not found", code: "USER_NOT_FOUND" },
      });
    }

    const newAccessToken = generateAccessToken(user.rows[0]);
    const newRefreshToken = generateRefreshToken(user.rows[0], familyId);

    const newRefreshTokenHash = await bcrypt.hash(newRefreshToken, 10);
    await pool.query(
      "INSERT INTO refresh_tokens (user_id, token_hash, family_id, is_revoked, expires_at) VALUES ($1, $2, $3, FALSE, NOW() + INTERVAL '7 days')",
      [decoded.id, newRefreshTokenHash, familyId],
    );

    setTokenCookies(res, newAccessToken, newRefreshToken);

    res.json({ success: true, message: "Token refreshed" });
  } catch (err) {
    console.error("Refresh error:", err);
    res.status(500).json({
      success: false,
      error: { message: "Internal server error", code: "SERVER_ERROR" },
    });
  }
};
