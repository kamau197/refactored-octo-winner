import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Admin client (bypasses RLS)
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE
);

const PORT = process.env.PORT || 3000;

//
// 🔐 JWT Middleware
//
function authenticate(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) return res.status(401).json({ error: "No token" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: "Invalid token" });
  }
}


//
// 📝 Register
//
app.post("/register", async (req, res) => {
  const { email, password } = req.body;

  const { data, error } = await supabase.auth.signUp({
    email,
    password
  });

  if (error) return res.status(400).json(error);

  // Create profile row
  await supabaseAdmin.from("profiles").insert({
    id: data.user.id,
    email
  });

  res.json({ message: "User registered", user: data.user });
});

//
// 🔑 Login
//
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) return res.status(400).json(error);

  res.json({
    message: "Login successful",
    access_token: data.session.access_token
  });
});

//
// 🤝 Send Friend Request
//
app.post("/send-friend-request", authenticate, async (req, res) => {
  const { targetEmail } = req.body;

  const { data: target } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("email", targetEmail)
    .single();

  if (!target) return res.status(404).json({ error: "User not found" });

  await supabaseAdmin.from("friend_requests").insert({
    sender_id: req.user.sub,
    receiver_id: target.id
  });

  await supabaseAdmin.from("notifications").insert({
    user_id: target.id,
    type: "friend_request",
    message: `${req.user.email} sent you a friend request`
  });

  res.json({ message: "Friend request sent" });
});

//
// 💰 Dummy Payment
//
app.post("/make-payment", authenticate, async (req, res) => {
  const { targetEmail, amount } = req.body;

  const { data: target } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("email", targetEmail)
    .single();

  if (!target) return res.status(404).json({ error: "User not found" });

  await supabaseAdmin.from("payments_dummy").insert({
    sender_id: req.user.sub,
    receiver_id: target.id,
    amount
  });

  await supabaseAdmin.from("notifications").insert({
    user_id: target.id,
    type: "payment",
    message: `${req.user.email} sent you ${amount} units`
  });

  res.json({ message: "Payment simulated" });
});

//
// 🔔 Notifications
//
app.get("/notifications", authenticate, async (req, res) => {
  const { data } = await supabaseAdmin
    .from("notifications")
    .select("*")
    .eq("user_id", req.user.sub)
    .order("created_at", { ascending: false });

  res.json(data);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});