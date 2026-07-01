const jwt = require("jsonwebtoken");

exports.authenticate = (req, res, next) => {
  // Get the token from the httpOnly cookie
  const token = req.cookies.accessToken;

  if (!token) {
    return res.status(401).json({
      success: false,
      error: { message: "Access token is missing", code: "NO_TOKEN" },
    });
  }

  try {
    // Verify token and attach decoded user info to request object
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      error: { message: "Invalid or expired token", code: "INVALID_TOKEN" },
    });
  }
};
