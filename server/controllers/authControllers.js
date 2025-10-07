import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import pool from "../config/db.js";
import dotenv from "dotenv";
import { OAuth2Client } from 'google-auth-library';
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

    return res.status(201).json({ token, user: newUser.rows[0] });
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




const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export const googleAuth = async (req, res) => {
    const { token } = req.body;

    try {
        // 1. Verify the Google ID token
        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: process.env.GOOGLE_CLIENT_ID,
        });

        const { sub, email, name, picture } = ticket.getPayload();

        // 2. Check if the user already exists in your database
        const userQuery = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
        const existingUser = userQuery.rows[0];

        let userForToken;
        let statusCode;

        if (existingUser) {
            // 3a. If user exists, use their data
            console.log(`Existing user logged in: ${existingUser.email}`);
            userForToken = existingUser;
            statusCode = 200; // OK
        } else {
            // 3b. If user does not exist, create a new one
            console.log(`Creating new user for: ${email}`);
            const newUserQuery = await pool.query(
                `INSERT INTO users (name, email, google_id, role)
                 VALUES ($1, $2, $3, 'customer')
                 RETURNING id, name, email, role`,
                [name, email, sub]
            );
            userForToken = newUserQuery.rows[0];
            statusCode = 201; // Created
        }

        // 4. Generate your application's own JWT
        const appToken = generateToken({
            id: userForToken.id,
            role: userForToken.role
        });

        // 5. Send the response
        return res.status(statusCode).json({
            token: appToken,
            user: userForToken
        });

    } catch (err) {
        console.error(`Google authentication error: ${err}`);
        return res.status(500).json({ msg: "Google Authentication failed" });
    }
};