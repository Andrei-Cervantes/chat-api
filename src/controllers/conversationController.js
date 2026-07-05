const { pool } = require("../config/db");

exports.createConversation = async (req, res) => {
  console.log("Creating conversation with data:", req.body);
};
