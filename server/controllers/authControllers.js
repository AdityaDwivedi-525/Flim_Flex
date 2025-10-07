import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import pool from "../config/db.js";
import dotenv from "dotenv";
dotenv.config();
// Helper: Generate JWT
const generateToken = (user) => {
  return jwt.sign(
    { id: user.id, role: user.role,name:user.name },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
};


// Register Customer

export const registerCustomerController = async (req, res) => {
  try {
    if(!req.body) return res.status(400).json({msg:"All fields are required"});
    const { name, email, password } = req.body;
    if(!name || !email || !password) return res.status(400).json({msg:"Must fill all the fields"});
    // check duplicate email
    const existing = await pool.query("SELECT * FROM users WHERE email=$1", [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ msg: "Email already in use" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await pool.query(
      `INSERT INTO users (name, email, password, role)
       VALUES ($1, $2, $3, 'customer')
       RETURNING id, name, email, role`,
      [name, email, hashedPassword]
    );

    const token = generateToken({id:newUser.rows[0],role:'customer'});

    res.status(201).json({ token, user: newUser.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
};


// Register Theater Admin

export const registerAdminController = async (req, res) => {
  try {
    const { name, email, password, adminSecretKey } = req.body;

    // optional: require a secret key for admin registration
    console.log(adminSecretKey,process.env.ADMIN_SECRET);
    if (adminSecretKey !== process.env.ADMIN_SECRET) {
      return res.status(403).json({ msg: "Unauthorized to register as admin" });
    }

    const existing = await pool.query("SELECT * FROM users WHERE email=$1", [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ msg: "Email already in use" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newAdmin = await pool.query(
      `INSERT INTO users (name, email, password, role)
       VALUES ($1, $2, $3, 'admin')
       RETURNING id, name, email, role`,
      [name, email, hashedPassword]
    );

    const token = generateToken(newAdmin.rows[0]);

    res.status(201).json({ token, user: newAdmin.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
};


// Login

export const loginController = async (req, res) => {
  try {
    const { email, password } = req.body;

    const userQuery = await pool.query("SELECT * FROM users WHERE email=$1", [email]);
    const user = userQuery.rows[0];
    if (!user) return res.status(400).json({ msg: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ msg: "Invalid credentials" });

    const token = generateToken(user);

    res.status(201).json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
};
