import { AppDataSource } from "../config/database";
import { User } from "../entities/User";
import { WorkerHours } from "../entities/WorkerHours";
import { bot } from "../bot/bot";
import { Between, ILike, FindOptionsWhere } from "typeorm";

function normalizeDate(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function fmt(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

export class WorkerService {
  private userRepo = AppDataSource.getRepository(User);
  private workerHoursRepo = AppDataSource.getRepository(WorkerHours);

  // Get last 5 days work hours for a specific user
  async getLast5DaysHours(userId: number): Promise<{ success: boolean; data?: any; message?: string }> {
    try {
      const today = normalizeDate(new Date());
      const fiveDaysAgo = new Date(today);
      fiveDaysAgo.setDate(today.getDate() - 4); // includes today (5 total days)

      const user = await this.userRepo.findOne({
        where: { id: userId }
      });

      if (!user) {
        return {
          success: false,
          message: "Пользователь не найден."
        };
      }

      const recentHours = await this.workerHoursRepo.find({
        where: { userId: user.id, date: Between(fiveDaysAgo, today) },
        order: { date: "ASC" },
      });

      console.dir(recentHours);

      let totalHours = recentHours.reduce(
        (sum, h) => sum + Number(h.hours || 0),
        0
      );

      // Round the 5-day total hours to the nearest integer
      totalHours = Math.round(totalHours);

      return {
        success: true,
        data: {
          user,
          hoursList: recentHours,
          totalHours
        }
      };
    } catch (error) {
      console.error("Error getting last 5 days hours:", error);
      return {
        success: false,
        message: "Ошибка при получении данных за последние 5 дней: " + error
      };
    }
  }

  // Get current week hours for a specific user
  async getWeekHours(userId: number): Promise<{ success: boolean; data?: any; message?: string }> {
    try {
      const today = new Date();
      const currentDay = today.getDay(); // 0 (Sunday) to 6 (Saturday)
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - currentDay + (currentDay === 0 ? -6 : 1)); // Monday of current week
      startOfWeek.setHours(0, 0, 0, 0);

      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6); // Sunday of current week
      endOfWeek.setHours(23, 59, 59, 999);

      const user = await this.userRepo.findOne({
        where: { id: userId }
      });

      if (!user) {
        return {
          success: false,
          message: "Пользователь не найден."
        };
      }

      const weekHours = await this.workerHoursRepo.find({
        where: { userId: user.id, date: Between(startOfWeek, endOfWeek) },
        order: { date: "ASC" },
      });

      let totalHours = weekHours.reduce(
        (sum, h) => sum + Number(h.hours || 0),
        0
      );

      // Round the weekly total hours to the nearest integer
      totalHours = Math.round(totalHours);

      return {
        success: true,
        data: {
          user,
          hoursList: weekHours,
          totalHours,
          startDate: startOfWeek,
          endDate: endOfWeek
        }
      };
    } catch (error) {
      console.error("Error getting week hours:", error);
      return {
        success: false,
        message: "Ошибка при получении данных за текущую неделю: " + error
      };
    }
  }

  // Get current month hours for a specific user
  async getMonthHours(userId: number, month?: number, year?: number): Promise<{ success: boolean; data?: any; message?: string }> {
    try {
      const now = new Date();
      const targetMonth = month !== undefined ? month : now.getMonth();
      const targetYear = year !== undefined ? year : now.getFullYear();

      const startOfMonth = new Date(targetYear, targetMonth, 1);
      const endOfMonth = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59, 999);

      const user = await this.userRepo.findOne({
        where: { id: userId }
      });

      if (!user) {
        return {
          success: false,
          message: "Пользователь не найден."
        };
      }

      const monthHours = await this.workerHoursRepo.find({
        where: { userId: user.id, date: Between(startOfMonth, endOfMonth) },
        order: { date: "ASC" },
      });

      let totalHours = monthHours.reduce(
        (sum, h) => sum + Number(h.hours || 0),
        0
      );

      // Round the monthly total hours to the nearest integer
      totalHours = Math.round(totalHours);

      // Get month name in Russian
      const monthNames = [
        'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
        'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
      ];

      return {
        success: true,
        data: {
          user,
          hoursList: monthHours,
          totalHours,
          startDate: startOfMonth,
          endDate: endOfMonth,
          monthName: monthNames[targetMonth],
          year: targetYear
        }
      };
    } catch (error) {
      console.error("Error getting month hours:", error);
      return {
        success: false,
        message: "Ошибка при получении данных за месяц: " + error
      };
    }
  }

  // Send last 5 days hours to a specific user
  async sendLast5DaysHours(userId: number): Promise<{ success: boolean; message: string }> {
    try {
      const result = await this.getLast5DaysHours(userId);

      if (!result.success || !result.data) {
        return { success: false, message: result.message || "Ошибка при получении данных" };
      }

      const { user, hoursList, totalHours } = result.data;

      if (!user.telegramId) {
        return { success: false, message: "Пользователь не привязан к Telegram" };
      }

      const message = this.formatFiveDaysStatsMessage(user, hoursList, totalHours);

      await bot.telegram.sendMessage(user.telegramId, message, {
        parse_mode: "HTML"
      });

      return { success: true, message: "История за 5 дней успешно отправлена" };
    } catch (error) {
      console.error("Error sending last 5 days hours:", error);
      return { success: false, message: "Ошибка при отправке истории за 5 дней: " + error };
    }
  }

  // Send weekly hours to a specific user
  async sendWeekHours(userId: number): Promise<{ success: boolean; message: string }> {
    try {
      const result = await this.getWeekHours(userId);

      if (!result.success || !result.data) {
        return { success: false, message: result.message || "Ошибка при получении данных" };
      }

      const { user, hoursList, totalHours, startDate, endDate } = result.data;

      if (!user.telegramId) {
        return { success: false, message: "Пользователь не привязан к Telegram" };
      }

      const message = this.formatWeekHoursMessage(user, hoursList, totalHours, startDate, endDate);

      await bot.telegram.sendMessage(user.telegramId, message, {
        parse_mode: "HTML"
      });

      return { success: true, message: "Часы за неделю успешно отправлены" };
    } catch (error) {
      console.error("Error sending week hours:", error);
      return { success: false, message: "Ошибка при отправке часов за неделю: " + error };
    }
  }

  // Send monthly hours to a specific user
  async sendMonthHours(userId: number, month?: number, year?: number): Promise<{ success: boolean; message: string }> {
    try {
      const result = await this.getMonthHours(userId, month, year);

      if (!result.success || !result.data) {
        return { success: false, message: result.message || "Ошибка при получении данных" };
      }

      const { user, hoursList, totalHours, monthName, year: targetYear } = result.data;

      if (!user.telegramId) {
        return { success: false, message: "Пользователь не привязан к Telegram" };
      }

      const message = this.formatMonthHoursMessage(user, hoursList, totalHours, monthName, targetYear);

      await bot.telegram.sendMessage(user.telegramId, message, {
        parse_mode: "HTML"
      });

      return { success: true, message: "Часы за месяц успешно отправлены" };
    } catch (error) {
      console.error("Error sending month hours:", error);
      return { success: false, message: "Ошибка при отправке часов за месяц: " + error };
    }
  }

  async updateWorkingHours(hours: string, userId: number) {
    try {
      const t = await this.workerHoursRepo.find({
        where: { userId },
        order: { id: "DESC" },
      });

      if (!t || t.length === 0) {
        return { success: false, message: "Not Found" };
      }

      const lastHours = t[t.length - 1];
      if (lastHours != null) {
        lastHours.hours = Number(hours);
        await this.workerHoursRepo.save(lastHours);
        return { success: true, message: "Working Hours saved successfully" };
      } else {
        return { success: false, message: "Not Found" };
      }
    } catch (error) {
      return { success: false, message: "Error update hours " + error };
    }
  }

  async updateWorkingHoursById(hours: string, workerHoursId: number) {
    try {
      const record = await this.workerHoursRepo.findOne({
        where: { id: workerHoursId },
      });

      if (!record) {
        return { success: false, message: "Not Found" };
      }

      record.hours = Number(hours);
      await this.workerHoursRepo.save(record);
      return { success: true, message: "Working Hours saved successfully", record };
    } catch (error) {
      return { success: false, message: "Error update hours " + error };
    }
  }

  async sendFiveDaysStats(): Promise<{
    success: boolean;
    message: string;
    sentCount?: number;
  }> {
    try {
      const today = normalizeDate(new Date());
      const fiveDaysAgo = new Date(today);
      fiveDaysAgo.setDate(today.getDate() - 4); // includes today (5 total days)

      const linkedUsers = await this.userRepo.find({
        where: { isLinked: true },
        relations: ["workerHours"],
      });

      let sentCount = 0;

      for (const user of linkedUsers) {
        if (!user.telegramId) continue;

        const recentHours = await this.workerHoursRepo.find({
          where: { userId: user.id, date: Between(fiveDaysAgo, today) },
          order: { date: "ASC" },
        });

        if (recentHours.length === 0) continue;

        let totalHours = recentHours.reduce(
          (sum, h) => sum + Number(h.hours || 0),
          0
        );

        // Round the total hours to the nearest integer
        totalHours = Math.round(totalHours);

        const message = this.formatFiveDaysStatsMessage(
          user,
          recentHours,
          totalHours
        );

        try {
          await bot.telegram.sendMessage(user.telegramId, message, {
            parse_mode: "HTML",
          });

          for (const h of recentHours) {
            h.sent = true;
            h.sentAt = new Date();
          }
          await this.workerHoursRepo.save(recentHours);

          sentCount++;
        } catch (error) {
          console.error(`Error sending to user ${user.id}:`, error);
        }
      }

      return {
        success: true,
        message: `Статистика за 5 дней отправлена ${sentCount} сотрудникам.`,
        sentCount,
      };
    } catch (error) {
      console.error("Error sending 5-day stats:", error);
      return {
        success: false,
        message: "Ошибка при отправке статистики: " + error,
      };
    }
  }

  private formatFiveDaysStatsMessage(
    user: User,
    hoursList: WorkerHours[],
    total: number
  ): string {
    const lines = hoursList
      .map(
        (h) =>
          `<b>${h.date}</b>: ${parseFloat(
            h.hours.toString()
          )} ч.`
      )
      .join("\n");

    return `<b>👷 ${
      user.name
    }</b>\n\n${lines}\n\n<b>Итого за 5 дней:</b> ${parseFloat(
      total.toString()
    )} ч.`;
  }

  // Format message for weekly hours
  private formatWeekHoursMessage(
    user: User,
    hoursList: WorkerHours[],
    total: number,
    startDate: Date,
    endDate: Date
  ): string {
    const lines = hoursList
      .map(
        (h) =>
          `<b>${h.date}</b>: ${parseFloat(
            h.hours.toString()
          )} ч.`
      )
      .join("\n");

    return `<b>📊 Рабочие часы за неделю</b>\n\n<b>👤 ${
      user.name
    }</b>\n<b>💼 ${user.position}</b>\n<b>📅 Период:</b> ${startDate} - ${endDate}\n\n${lines}\n\n<b>📈 Итого за неделю:</b> ${parseFloat(
      total.toString()
    )} ч.`;
  }

  // Format message for monthly hours
  private formatMonthHoursMessage(
    user: User,
    hoursList: WorkerHours[],
    total: number,
    monthName: string,
    year: number
  ): string {
    const lines = hoursList
      .map(
        (h) =>
          `<b>${h.date}</b>: ${parseFloat(
            h.hours.toString()
          )} ч.`
      )
      .join("\n");

    return `<b>📊 Рабочие часы за месяц</b>\n\n<b>👤 ${
      user.name
    }</b>\n<b>💼 ${user.position}</b>\n<b>📅 Период:</b> ${monthName} ${year}\n\n${lines}\n\n<b>📈 Итого за месяц:</b> ${parseFloat(
      total.toString()
    )} ч.`;
  }

  async sendDailyHoursToAllWorkers(
    date?: Date
  ): Promise<{ success: boolean; message: string; sentCount?: number }> {
    try {
      const target = normalizeDate(date ?? new Date());

      const linkedUsers = await this.userRepo.find({
        where: { isLinked: true },
        relations: ["workerHours"],
      });

      let sentCount = 0;

      for (const user of linkedUsers) {
        if (!user.telegramId) continue;

        const dayHours = await this.workerHoursRepo.find({
          where: { userId: user.id, date: target },
          order: { id: "ASC" },
        });

        if (dayHours.length === 0) continue;

        // If multiple records per day, sum or show the first? Here we send the *list* and total:
        let total = dayHours.reduce((sum, h) => sum + Number(h.hours || 0), 0);

        // Round the total hours to the nearest integer
        total = Math.round(total);

        const header = `
<b>📊 Ежедневные рабочие часы</b>

<b>👤 Имя:</b> ${user.name}
<b>💼 Должность:</b> ${user.position}
<b>📅 Дата:</b> ${fmt(target)}
        `.trim();

        const lines = dayHours
          .map(
            (h) =>
              `• ${
                h.activityDescription || ""
              } — ${parseFloat(String(h.hours ?? 0))} ч.`
          )
          .join("\n");

        const message = `${header}\n\n${lines}\n\n<b>Итого:</b> ${parseFloat(
          String(total)
        )} ч.`.trim();

        const cbDate = String(target.getTime());
        try {
          await bot.telegram.sendMessage(user.telegramId, message, {
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "✅ Верно",
                    callback_data: `correct_${user.id}_${cbDate}`,
                  },
                  {
                    text: "❌ Неверно",
                    callback_data: `incorrect_${user.id}_${cbDate}`,
                  },
                ],
              ],
            },
          });

          // mark all as sent
          for (const h of dayHours) {
            h.sent = true;
            h.sentAt = new Date();
          }
          await this.workerHoursRepo.save(dayHours);

          sentCount++;
        } catch (error) {
          console.error(`Error sending to user ${user.id}:`, error);
        }
      }

      return {
        success: true,
        message: `Ежедневные рабочие часы отправлены ${sentCount} сотрудникам.`,
        sentCount,
      };
    } catch (error) {
      console.error("Error sending daily hours:", error);
      return {
        success: false,
        message: "Ошибка при отправке ежедневных часов: " + error,
      };
    }
  }

  async sendByUserId(
    userId: number,
    date?: Date,
    msg?: string,
    overrideHours?: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const target = normalizeDate(date ?? new Date());

      const user = await this.userRepo.findOne({
        where: { id: userId, isLinked: true },
      });

      if (!user || !user.telegramId) {
        return {
          success: false,
          message: "Пользователь не найден или не связан с Telegram.",
        };
      }

      const records = await this.workerHoursRepo.find({
        where: { userId: user.id, date: target },
        order: { id: "ASC" },
      });

      if (records.length === 0) {
        return {
          success: false,
          message: "Рабочие часы на выбранную дату не найдены.",
        };
      }

      let total = records.reduce((sum, r) => sum + Number(r.hours || 0), 0);

      // Round the total hours to the nearest integer
      total = Math.round(total);

      const header = `
${msg ? "<b>⚠️⚠️⚠️ " + msg + " ⚠️⚠️⚠️</b>" : ""}

<b>📊 Ежедневные рабочие часы</b>

<b>👤 Имя:</b> ${user.name}
<b>💼 Должность:</b> ${user.position}
<b>📅 Дата:</b> ${fmt(target)}
      `.trim();

      const lines = records
        .map(
          (h) =>
            `• ${
              h.activityDescription || ""
            } — ${parseFloat(String(overrideHours ?? h.hours ?? 0))} ч.`
        )
        .join("\n");

      const message = `${header}\n\n${lines}\n\n<b>Итого:</b> ${parseFloat(
        String(total)
      )} ч.`.trim();

      const cbDate = String(target.getTime());
      await bot.telegram.sendMessage(user.telegramId, message, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "✅ Верно",
                callback_data: `correct_${user.id}_${cbDate}`,
              },
              {
                text: "❌ Неверно",
                callback_data: `incorrect_${user.id}_${cbDate}`,
              },
            ],
          ],
        },
      });

      for (const r of records) {
        r.sent = true;
        r.sentAt = new Date();
      }
      await this.workerHoursRepo.save(records);

      return { success: true, message: "Рабочие часы успешно отправлены." };
    } catch (error) {
      console.error(`Error sending to user ${userId}:`, error);
      return { success: false, message: "Ошибка при отправке: " + error };
    }
  }

  private formatWorkingHoursMessage(
    user: User,
    workerHours: WorkerHours,
    message?: string,
    hours?: string
  ): string {
    const date = workerHours.date;

    return `
${message ? "<b>⚠️⚠️⚠️ " + message + " ⚠️⚠️⚠️</b>" : ""}

<b>📊 Ежедневные рабочие часы</b>

<b>👤 Имя:</b> ${user.name}
<b>💼 Должность:</b> ${user.position}
<b>📅 Дата:</b> ${date}
<b>⏰ Рабочие часы:</b> ${hours ? hours : workerHours.hours} часов

<b>🔧 Деятельность:</b> ${workerHours.activityDescription}
<b>🏢 Команда:</b> ${workerHours.team}
<b>📝 Описание:</b> ${workerHours.description}

Если эта информация неверна, ответьте на это сообщение для запроса исправления.
    `.trim();
  }

  async getWorkerHoursList(
    page: number = 1,
    limit: number = 10,
    search?: string
  ) {
    try {
      const skip = (page - 1) * limit;

      const whereConditions: FindOptionsWhere<WorkerHours> = {};

      if (search) {
        whereConditions.description = ILike(`%${search}%`);
      }

      const totalCount = await this.workerHoursRepo.count({
        where: search
          ? [
              { description: ILike(`%${search}%`) },
              { costCenter: ILike(`%${search}%`) },
            ]
          : undefined,
      });

      const workerHours = await this.workerHoursRepo.find({
        where: search
          ? [
              { description: ILike(`%${search}%`) },
              { costCenter: ILike(`%${search}%`) },
            ]
          : undefined,
        relations: ["user"],
        skip,
        take: limit,
        order: { date: "DESC" },
      });

      return {
        success: true,
        data: workerHours,
        pagination: {
          total: totalCount,
          page,
          limit,
          totalPages: Math.ceil(totalCount / limit),
        },
      };
    } catch (error) {
      console.error("Error getting worker hours list:", error);
      return {
        success: false,
        message: "Error getting worker hours list: " + error,
      };
    }
  }

  async getUserWorkingHoursSum(startDate: Date, endDate: Date) {
    try {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);

      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      const users = await this.userRepo.find();

      const result = await Promise.all(
        users.map(async (user) => {
          const workerHours = await this.workerHoursRepo.find({
            where: {
              userId: user.id,
              date: Between(start, end),
            },
          });

          let totalHours = workerHours.reduce(
            (sum, record) => sum + Number(record.hours),
            0
          );

          // Round the total hours to the nearest integer
          totalHours = Math.round(totalHours);

          return {
            user,
            totalHours,
            recordsCount: workerHours.length,
          };
        })
      );

      return {
        success: true,
        data: result,
        dateRange: { startDate: start, endDate: end },
      };
    } catch (error) {
      console.error("Error getting user working hours sum:", error);
      return {
        success: false,
        message: "Error getting user working hours sum: " + error,
      };
    }
  }
}
