import "reflect-metadata";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import { AppDataSource } from "./config/database";
import { botSetup } from "./bot/bot";
import { setupRoutes } from "./routes";
import { CronJob } from "cron";
import { WorkerService } from "./services/WorkerService";
import dotenv from "dotenv";

require("dotenv").config();
dotenv.config();

console.log(process.env.DATABASE_URL);

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Make io available globally
declare global {
  var io: Server;
}
global.io = io;

async function startServer() {
  try {
    // Initialize database
    await AppDataSource.initialize();
    console.log("Database connected successfully");

    // Run migrations
    console.log("Running migrations...");
    await AppDataSource.runMigrations();
    console.log("Migrations completed successfully");

    // Setup routes
    setupRoutes(app);

    // Setup Telegram bot (conditionally)
    if (process.env.SKIP_BOT_SETUP !== "true") {
      console.log("Setting up Telegram bot...");
      await botSetup();
      console.log("Telegram bot setup completed");
    } else {
      console.log("Skipping Telegram bot setup (SKIP_BOT_SETUP=true)");
    }

    // Setup cron job for daily notifications (9 AM)
    const job = new CronJob("0 9 * * *", async () => {
      console.log("Running daily worker hours notification...");
      const workerService = new WorkerService();
      await workerService.sendDailyHoursToAllWorkers();
    });
    job.start();

    const job2 = new CronJob("0 9 1,5,10,15,20,25,30 * *", async () => {
      console.log("Running worker hours notification (every 5 days)...");
      const workerService = new WorkerService();
      await workerService.sendDailyHoursToAllWorkers();
    });

    job2.start();

    // Socket.io connection handling
    io.on("connection", (socket) => {
      console.log("Admin connected:", socket.id);

      socket.on("disconnect", () => {
        console.log("Admin disconnected:", socket.id);
      });
    });

    const PORT = process.env.PORT || 7707;
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Error starting server:", error);
    process.exit(1);
  }
}

startServer();
