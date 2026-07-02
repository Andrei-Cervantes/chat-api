exports.validateRegistration = (email, username, password) => {
  const errors = [];

  // Check email format with a regex pattern
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push("Valid email is required");
  }
  // Username must be 3-30 characters, letters/numbers/underscore only
  if (
    !username ||
    username.length < 3 ||
    username.length > 30 ||
    !/^[a-zA-Z0-9_]+$/.test(username)
  ) {
    errors.push("Username must be 3-30 alphanumeric characters");
  }
  // Enforce minimum password length
  if (!password || password.length < 8) {
    errors.push("Password must be at least 8 characters");
  }

  return errors;
};

exports.validateLogin = (email, password) => {
  const errors = [];

  if (!email) {
    errors.push("Email is required");
  }
  if (!password) {
    errors.push("Password is required");
  }

  return errors;
};

// HTML Sanitizer
exports.sanitizeHtml = (str) => {
  // Prevent stored XSS by escaping HTML special characters
  if (typeof str !== "string") return str;
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
};
