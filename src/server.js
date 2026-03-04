const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const cookieParser = require("cookie-parser");
const multer = require("multer");
const { v2: cloudinary } = require("cloudinary");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "../public")));

// Connect to MongoDB
const mongoURI = process.env.MONGO_URI || "mongodb://localhost:27017/todoapp";
mongoose.connect(mongoURI)
  .then(() => console.log("Connected to MongoDB"))
  .catch(err => console.error("MongoDB connection error:", err));

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'chat_app',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
  },
});
const upload = multer({ storage: storage });

// Define Mongoose Schema and Model
const messageSchema = new mongoose.Schema({
  content: { type: String, default: "" },
  imageUrl: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now }
});

const Message = mongoose.model("Message", messageSchema);

// Auth routes
app.post("/api/login", (req, res) => {
  const { password } = req.body;
  if (password === process.env.CHAT_PASSWORD) {
    res.cookie("auth", "true", { httpOnly: true, maxAge: 1000 * 60 * 60 * 24 * 365 }); // 1 year
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, message: "Incorrect password" });
  }
});

app.get("/api/check-auth", (req, res) => {
  if (req.cookies.auth === "true") {
    res.json({ authenticated: true });
  } else {
    res.status(401).json({ authenticated: false });
  }
});

app.post("/api/logout", (req, res) => {
  res.clearCookie("auth");
  res.json({ success: true });
});

// Auth Middleware
const requireAuth = (req, res, next) => {
  if (req.cookies.auth === "true") return next();
  res.status(401).json({ message: "Unauthorized" });
};

app.get("/api/messages", requireAuth, async (req, res) => {
  try {
    const messages = await Message.find().sort({ createdAt: 1 });
    const formattedMessages = messages.map(m => ({
      id: m._id.toString(),
      content: m.content,
      imageUrl: m.imageUrl,
      createdAt: m.createdAt
    }));
    res.json(formattedMessages);
  } catch (err) {
    res.status(500).json({ message: "Error fetching messages" });
  }
});

app.post("/api/messages", requireAuth, upload.single("image"), async (req, res) => {
  const content = req.body.content || "";
  const imageUrl = req.file ? req.file.path : "";

  if (!content && !imageUrl) {
    return res.status(400).json({ message: "Content or image required" });
  }

  try {
    const newMessage = new Message({ content, imageUrl });
    await newMessage.save();
    res.status(201).json({
      message: "Message added",
      data: {
        id: newMessage._id.toString(),
        content: newMessage.content,
        imageUrl: newMessage.imageUrl,
        createdAt: newMessage.createdAt
      }
    });
  } catch (err) {
    res.status(500).json({ message: "Error adding message" });
  }
});

app.delete("/api/messages/:id", requireAuth, async (req, res) => {
  const id = req.params.id;
  try {
    const deletedMessage = await Message.findByIdAndDelete(id);
    if (!deletedMessage) return res.status(404).json({ message: "Message not found" });
    res.json({ message: "Message deleted", id });
  } catch (err) {
    res.status(500).json({ message: "Error deleting message" });
  }
});

const port = process.env.PORT || 5001;
app.listen(port, () => console.log(`Server running on port ${port}`));
