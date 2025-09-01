import nodemailer from "nodemailer";
import { Feedback } from "../entities/Feedback";
import { User } from "../entities/User";
import { WorkerHours } from "../entities/WorkerHours";

export class EmailService {
  private transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true, // SSL
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  }

  async sendFeedbackNotification(
    feedback: Feedback,
    user: User,
    workerHours?: WorkerHours
  ) {
    try {
      const recipients = (process.env.EMAIL_RECIPIENTS || "")
        .split(",")
        .map((r) => r.trim())
        .filter(Boolean);

      if (!recipients.length) return;

      let body = `
        <h3>📩 New Feedback Received</h3>
        <p><b>User:</b> ${user.name} (${user.position})</p>
        <p><b>Message:</b> ${feedback.message}</p>
      `;

      if (workerHours) {
        const date = new Date(workerHours.date).toLocaleDateString("ru-RU");
        body += `
          <p><b>📅 Date:</b> ${date}</p>
          <p><b>⏱ Hours:</b> ${workerHours.hours}</p>
        `;
      }

      await this.transporter.sendMail({
        from: `"Worker Hours Bot" <${process.env.EMAIL_USER}>`,
        to: recipients,
        subject: "New Feedback Notification",
        html: body,
      });

      console.log("✅ Feedback email sent successfully");
    } catch (error) {
      console.error("❌ Email send error:", error);
    }
  }
}
