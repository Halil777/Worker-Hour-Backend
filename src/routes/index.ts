import { Express } from "express";
import multer from "multer";
import path from "path";
import { ExcelService } from "../services/ExcelService";
import { WorkerService } from "../services/WorkerService";
import { AppDataSource } from "../config/database";
import { User } from "../entities/User";
import { Feedback } from "../entities/Feedback";
import { ExcelUpload } from "../entities/ExcelUpload";
import { searchRouter } from "./search";
import { bot } from "../bot/bot";

const upload = multer({
  dest: "uploads/",
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === ".xlsx" || ext === ".xls") {
      cb(null, true);
    } else {
      cb(new Error("Only Excel files are allowed"));
    }
  },
});

export function setupRoutes(app: Express) {
  const excelService = new ExcelService();
  const workerService = new WorkerService();
  const userRepo = AppDataSource.getRepository(User);
  const feedbackRepo = AppDataSource.getRepository(Feedback);
  const excelUploadRepo = AppDataSource.getRepository(ExcelUpload);

  app.use("/admin/search", searchRouter);

  // Health check
  app.get("/health", (req, res) => {
    res.json({ status: "OK", timestamp: new Date().toISOString() });
  });

  // Simple test endpoint
  app.get("/test", (req, res) => {
    res.json({ 
      message: "HTTP requests are working!", 
      timestamp: new Date().toISOString(),
      port: process.env.PORT || 3004
    });
  });

  // ✅ Upload Excel file with selected date
  app.post("/admin/upload-excel", upload.single("excel"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No Excel file uploaded" });
      }

      const { targetDate } = req.body;
      const dateToUse = targetDate ? new Date(targetDate) : new Date();

      const result = await excelService.processExcelFile(
        req.file.path,
        req.file.originalname,
        dateToUse
      );

      if (result.success) {
        res.json({
          message: result.message,
          recordsProcessed: result.recordsProcessed,
        });
      } else {
        res.status(400).json({ error: result.message });
      }
    } catch (error) {
      console.error("Upload error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Response to user message
  app.post("/admin/response-user-message", async (req, res) => {
    try {
      await workerService.updateWorkingHours(req.body.hours, req.body.userId);
      await workerService.sendByUserId(
        req.body.userId,
        req.body.message,
        req.body.hours
      );
      res.status(200).json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Send daily hours manually
  app.post("/admin/send-daily-hours", async (req, res) => {
    try {
      const result = await workerService.sendDailyHoursToAllWorkers();
      await workerService.sendFiveDaysStats();
      if (result.success) {
        res.json({
          message: result.message,
          sentCount: result.sentCount,
        });
      } else {
        res.status(400).json({ error: result.message });
      }
    } catch (error) {
      console.error("Send hours error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get all users
  app.get("/admin/users", async (req, res) => {
    try {
      const users = await userRepo.find({ order: { name: "ASC" } });
      res.json(users);
    } catch (error) {
      console.error("Get users error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get all feedbacks
  app.get("/admin/feedbacks", async (req, res) => {
    try {
      const feedbacks = await feedbackRepo.find({
        relations: ["user"],
        order: { createdAt: "DESC" },
      });
      res.json(feedbacks);
    } catch (error) {
      console.error("Get feedbacks error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get upload history
  app.get("/admin/uploads", async (req, res) => {
    try {
      const uploads = await excelUploadRepo.find({
        order: { createdAt: "DESC" },
      });
      res.json(uploads);
    } catch (error) {
      console.error("Get uploads error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get statistics
  app.get("/admin/stats", async (req, res) => {
    try {
      const totalUsers = await userRepo.count();
      const linkedUsers = await userRepo.count({ where: { isLinked: true } });
      const todayFeedbacks = await feedbackRepo.count({
        where: { createdAt: new Date() },
      });

      res.json({
        totalUsers,
        linkedUsers,
        unlinkedUsers: totalUsers - linkedUsers,
        todayFeedbacks,
      });
    } catch (error) {
      console.error("Get stats error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get worker hours list with pagination and search
  app.get("/admin/worker-hours", async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const search = req.query.search as string;

      const result = await workerService.getWorkerHoursList(
        page,
        limit,
        search
      );

      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json({ error: result.message });
      }
    } catch (error) {
      console.error("Get worker hours error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get sum of working hours for each user within a date range
  app.get("/admin/user-hours-sum", async (req, res) => {
    try {
      const startDate = req.query.startDate
        ? new Date(req.query.startDate as string)
        : new Date();
      const endDate = req.query.endDate
        ? new Date(req.query.endDate as string)
        : new Date();

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return res
          .status(400)
          .json({ error: "Invalid date format. Use YYYY-MM-DD format." });
      }

      const result = await workerService.getUserWorkingHoursSum(
        startDate,
        endDate
      );

      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json({ error: result.message });
      }
    } catch (error) {
      console.error("Get user hours sum error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Disconnect Telegram ID from all users with that Telegram ID
  app.post("/admin/disconnect-telegram", async (req, res) => {
    try {
      const { telegramId } = req.body;

      if (!telegramId) {
        return res.status(400).json({ error: "Telegram ID is required" });
      }

      // Find all users with this Telegram ID
      const users = await userRepo.find({ where: { telegramId } });

      if (!users || users.length === 0) {
        return res.status(404).json({ error: "No users found with this Telegram ID" });
      }

      // Update all users to disconnect Telegram
      for (const user of users) {
        user.telegramId = null;
        user.isLinked = false;
        await userRepo.save(user);
      }

      await bot.telegram.sendMessage(telegramId, `Идентификатор Telegram ${telegramId} отключен от пользователей ${users.length}`, {
        parse_mode: "HTML"
      });

      res.json({ 
        success: true, 
        message: `Telegram ID ${telegramId} disconnected from ${users.length} user(s)`,
        users: users.map(u => ({ id: u.id, name: u.name }))
      });
    } catch (error) {
      console.error("Disconnect Telegram error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
}
