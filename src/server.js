const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

// Connect to MongoDB
const mongoURI = process.env.MONGO_URI || "mongodb://localhost:27017/todoapp";
mongoose.connect(mongoURI)
  .then(() => console.log("Connected to MongoDB"))
  .catch(err => console.error("MongoDB connection error:", err));

// Define Mongoose Schema and Model
const taskSchema = new mongoose.Schema({
  content: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const Task = mongoose.model("Task", taskSchema);

app.get("/tasks", async (req, res) => {
  try {
    const tasks = await Task.find().sort({ createdAt: 1 });
    // Map _id to id to match the existing frontend expectations
    const formattedTasks = tasks.map(t => ({
      id: t._id.toString(),
      content: t.content
    }));
    res.json(formattedTasks);
  } catch (err) {
    res.status(500).json({ message: "Error fetching tasks" });
  }
});

app.post("/addTask", async (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ message: "content required" });

  try {
    const newTask = new Task({ content });
    await newTask.save();
    res.status(201).json({ message: "Task added", task: { id: newTask._id.toString(), content: newTask.content } });
  } catch (err) {
    res.status(500).json({ message: "Error adding task" });
  }
});

app.delete("/deleteTask/:id", async (req, res) => {
  const id = req.params.id;
  try {
    const deletedTask = await Task.findByIdAndDelete(id);
    if (!deletedTask) return res.status(404).json({ message: "Task not found" });
    res.json({ message: "Task deleted", id });
  } catch (err) {
    res.status(500).json({ message: "Error deleting task" });
  }
});

const port = process.env.PORT || 5001;
app.listen(port, () => console.log(`Server running on port ${port}`));
