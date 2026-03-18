const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const cookieParser = require("cookie-parser");
const multer = require("multer");
const { v2: cloudinary } = require("cloudinary");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const http = require("http");
const { Server } = require("socket.io");
require("dotenv").config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

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
  senderName: { type: String, default: "Anonymous" },
  reactions: { type: Object, default: {} },
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
      senderName: m.senderName,
      reactions: m.reactions || {},
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
  const senderName = req.body.senderName || "Anonymous";

  if (!content && !imageUrl) {
    return res.status(400).json({ message: "Content or image required" });
  }

  try {
    const newMessage = new Message({ content, imageUrl, senderName, reactions: {} });
    await newMessage.save();

    const formattedMessage = {
      id: newMessage._id.toString(),
      content: newMessage.content,
      imageUrl: newMessage.imageUrl,
      senderName: newMessage.senderName,
      reactions: newMessage.reactions,
      createdAt: newMessage.createdAt
    };

    io.emit('newMessage', formattedMessage);
    res.status(201).json({ message: "Message added", data: formattedMessage });
  } catch (err) {
    res.status(500).json({ message: "Error adding message" });
  }
});

app.post("/api/messages/:id/react", requireAuth, async (req, res) => {
  const id = req.params.id;
  const { emoji } = req.body;
  if (!emoji) return res.status(400).json({ message: "Emoji required" });

  try {
    const msg = await Message.findById(id);
    if (!msg) return res.status(404).json({ message: "Message not found" });

    // Increment reaction count
    const currentCount = msg.reactions[emoji] || 0;
    const newReactions = { ...msg.reactions, [emoji]: currentCount + 1 };

    // Mongoose requires markModified for mixed types
    msg.reactions = newReactions;
    msg.markModified('reactions');
    await msg.save();

    io.emit('messageReacted', { id: msg._id.toString(), reactions: msg.reactions });
    res.json({ success: true, reactions: msg.reactions });
  } catch (err) {
    res.status(500).json({ message: "Error reacting to message" });
  }
});

app.delete("/api/messages/:id", requireAuth, async (req, res) => {
  const id = req.params.id;
  try {
    const deletedMessage = await Message.findByIdAndDelete(id);
    if (!deletedMessage) return res.status(404).json({ message: "Message not found" });

    io.emit('messageDeleted', id);
    res.json({ message: "Message deleted", id });
  } catch (err) {
    res.status(500).json({ message: "Error deleting message" });
  }
});

app.use((err, req, res, next) => {
  console.error("EXPRESS ERROR CAUGHT:", err);
  res.status(500).json({ message: "Internal server error", error: err.message || err });
});

// Use server.listen instead of app.listen for Socket.io
const port = process.env.PORT || 5001;
server.listen(port, () => console.log(`Server running on port ${port}`));
