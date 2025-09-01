import { Telegraf, type Context } from "telegraf";
import { AppDataSource } from "../config/database";
import { User } from "../entities/User";
import { Feedback, FeedbackAction } from "../entities/Feedback";
import { WorkerHours } from "../entities/WorkerHours";
import { ILike } from "typeorm";
import { WorkerService } from "../services/WorkerService";

const BOT_TOKEN = process.env.BOT_TOKEN || "REPLACE_WITH_YOUR_TOKEN";
export const bot = new Telegraf(BOT_TOKEN);

function normalizeDate(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

// Helper function to safely answer callback queries
async function safeAnswerCbQuery(ctx: Context, text?: string, options?: any) {
  try {
    await ctx.answerCbQuery(text, options);
  } catch (error) {
    console.log("Callback query too old or invalid:", (error as any).message);
  }
}

// Helper function to safely send messages
async function safeSendMessage(ctx: Context, text: string, options?: any) {
  try {
    return await ctx.reply(text, options);
  } catch (error) {
    const err = error as any;
    if (err.response?.error_code === 403) {
      console.log(`Bot blocked by user ${ctx.from?.id}: ${err.message}`);
    } else {
      console.error("Error sending message:", err.message);
    }
    return null;
  }
}

// Enhanced user search function
async function enhancedUserSearch(userRepo: any, searchText: string) {
  const text = searchText.trim().toLowerCase();
  if (!text) return [];

  // Minimum search length validation
  if (text.length < 2) return [];

  // Split search text into words for flexible matching
  const searchWords = text.split(/\s+/).filter((word) => word.length > 1);

  if (searchWords.length === 0) return [];

  // Case 1: Single word search - match against name OR position
  if (searchWords.length === 1) {
    const singleWord = searchWords[0];
    return await userRepo.find({
      where: [
        { name: ILike(`%${singleWord}%`) },
        { position: ILike(`%${singleWord}%`) },
      ],
      order: { name: "ASC" },
      take: 50, // Limit to prevent performance issues
    });
  }

  // Case 2: Multiple words - try to match all words in name
  // This handles cases like "John Doe" or "Doe John"
  const allUsers = await userRepo.find({
    order: { name: "ASC" },
    take: 1000, // Get more users for client-side filtering
  });

  // Filter users where ALL search words appear in name (in any order)
  const matchingUsers = allUsers.filter((user: any) => {
    const userName = user.name.toLowerCase();
    const userPosition = (user.position || "").toLowerCase();
    const userFullText = `${userName} ${userPosition}`;

    return searchWords.every((word) => userFullText.includes(word));
  });

  // Sort by relevance - exact name matches first, then partial matches
  return matchingUsers.sort((a: any, b: any) => {
    const aName = a.name.toLowerCase();
    const bName = b.name.toLowerCase();

    // Prioritize names that start with the search terms
    const aStartsWithFirst = aName.startsWith(searchWords[0]);
    const bStartsWithFirst = bName.startsWith(searchWords[0]);

    if (aStartsWithFirst && !bStartsWithFirst) return -1;
    if (!aStartsWithFirst && bStartsWithFirst) return 1;

    // Then sort alphabetically
    return aName.localeCompare(bName);
  });
}

// Helper function to show both inline and keyboard menus
async function showMenus(ctx: Context) {
  // Show inline keyboard menu
  await ctx.reply("📋 Выберите действие:", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "📊 Последние 5 дней", callback_data: "action_last5days" }],
        [{ text: "📅 Текущая неделя", callback_data: "action_week" }],
        [{ text: "📆 Текущий месяц", callback_data: "action_month" }],
        [{ text: "🗓 История по месяцам", callback_data: "action_history" }],
        [{ text: "💬 Сообщить о проблеме", callback_data: "action_feedback" }],
      ],
    },
  });

  // Show persistent keyboard menu
  await ctx.reply("Также можете использовать кнопки меню ниже:", {
    reply_markup: {
      keyboard: [
        [{ text: "📊 Последние 5 дней" }, { text: "📅 Текущая неделя" }],
        [{ text: "📆 Текущий месяц" }, { text: "🗓 История по месяцам" }],
        [{ text: "💬 Сообщить о проблеме" }],
      ],
      resize_keyboard: true,
    },
  });
}

const userSessions = new Map<
  string,
  {
    awaitingFeedback?: boolean;
    feedbackType?: "general" | "hours_mistake";
    selectedDate?: Date;
    awaitingHoursInput?: { workerHoursId: number };
  }
>();

export async function botSetup() {
  const userRepo = AppDataSource.getRepository(User);
  const feedbackRepo = AppDataSource.getRepository(Feedback);
  const workerHoursRepo = AppDataSource.getRepository(WorkerHours);
  const workerService = new WorkerService();

  // Global error handler for the bot
  bot.catch((err, ctx) => {
    console.error("Unhandled bot error:", err);
    console.error(
      "Update that caused the error:",
      JSON.stringify(ctx.update, null, 2)
    );
  });

  // /start — link instructions
  bot.start(async (ctx: Context) => {
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) return;

    // Check if user is already linked
    const user = await userRepo.findOne({ where: { telegramId } });
    if (user) {
      // User is already linked, show menu
      await safeSendMessage(
        ctx,
        `👋 Добро пожаловать, ${user.name}! Вы уже подключены к системе.`
      );

      await showMenus(ctx);
    } else {
      // User is not linked, show link instructions
      await safeSendMessage(
        ctx,
        "👋 Добро пожаловать! Для подключения к системе:\n\n🔗 **Способ 1:** Введите команду с ID\n`/link 1005767`\n\n🔍 **Способ 2:** Найдите себя по имени\nПросто напишите ваше имя или фамилию\nПример: `Иван Петров` или `Петров`\n\n💡 Используйте `/search` для помощи по поиску"
      );
    }
  });

  bot.command("tgid", async (ctx: Context) => {
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) return;
    await safeSendMessage(ctx, `${telegramId}`);
  });

  // /link <id> — link user
  bot.command("link", async (ctx: Context) => {
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) return;

    const args = (ctx.message as any)["text"].split(" ");
    if (!args || args.length < 2) {
      await safeSendMessage(
        ctx,
        "Пожалуйста, введите ваш персональный ID: /link [ПЕРСОНАЛЬНЫЙ_ID]"
      );
      return;
    }

    const personalId = Number.parseInt(args[1], 10);
    if (isNaN(personalId)) {
      await safeSendMessage(
        ctx,
        "Неверный персональный ID. Пожалуйста, введите число."
      );
      return;
    }

    try {
      // Check if this telegramId is already connected to another user
      const existingUser = await userRepo.findOne({ where: { telegramId } });
      if (existingUser && existingUser.id !== personalId) {
        await safeSendMessage(
          ctx,
          `Ваш Telegram аккаунт уже привязан к пользователю ${existingUser.name}. Для привязки к другому пользователю, необходимо сначала отвязать текущего пользователя.`,
          {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "Отправить запрос администратору на отвязку",
                    callback_data: `logout_request_${existingUser.id}`,
                  },
                ],
              ],
            },
          }
        );
        return;
      }

      const user = await userRepo.findOne({ where: { id: personalId } });
      if (!user) {
        await safeSendMessage(
          ctx,
          "Данный персональный ID не найден в системе. Пожалуйста, введите правильный ID."
        );
        return;
      }

      // Check if the user is already linked to another Telegram account
      if (user.isLinked && user.telegramId && user.telegramId !== telegramId) {
        await safeSendMessage(
          ctx,
          "Данный персональный ID уже привязан к другому Telegram аккаунту."
        );
        return;
      } else {
        user.telegramId = telegramId;
        user.isLinked = true;
        await userRepo.save(user);
        await safeSendMessage(
          ctx,
          `👋 Привет ${user.name}! Ваш аккаунт успешно привязан. Теперь вы будете получать ваши ежедневные рабочие часы через этого бота.`
        );
      }

      // optional: send today's by default
      await workerService.sendByUserId(user.id);

      await showMenus(ctx);
    } catch (error) {
      console.error("Link error:", error);
      await safeSendMessage(
        ctx,
        "Произошла ошибка. Пожалуйста, попробуйте еще раз."
      );
    }
  });

  // Text search for user linking via name and menu button handlers
  bot.on("message", async (ctx: Context) => {
    if (!ctx.message || !("text" in ctx.message)) return;
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) return;

    const text = ctx.message.text;

    console.log("text:", text);

    const session = userSessions.get(telegramId);
    if (session?.awaitingHoursInput) {
      const user = await userRepo.findOne({ where: { telegramId } });
      if (!user) {
        userSessions.delete(telegramId);
        await safeSendMessage(
          ctx,
          "Сначала вам нужно привязать аккаунт. Напишите /start."
        );
        return;
      }

      const hours = parseFloat(text.replace(",", "."));
      if (Number.isNaN(hours)) {
        await safeSendMessage(ctx, "Пожалуйста, введите число часов.");
        return;
      }

      const workerHours = await workerHoursRepo.findOne({
        where: { id: session.awaitingHoursInput.workerHoursId },
      });

      if (!workerHours) {
        userSessions.delete(telegramId);
        await safeSendMessage(ctx, "Запись рабочих часов не найдена.");
        return;
      }

      const feedback = new Feedback();
      feedback.userId = user.id;
      feedback.workerHoursId = workerHours.id;
      feedback.message = `Пользователь указал правильное количество часов: ${hours}`;
      feedback.telegramUserId = telegramId;
      feedback.adminNotified = true;
      feedback.action = FeedbackAction.INCORRECT_TIME;

      await feedbackRepo.save(feedback);

      global.io.emit("newFeedback", {
        id: feedback.id,
        userName: user.name,
        userPosition: user.position,
        message: feedback.message,
        hours: workerHours.hours,
        requestedHours: hours,
        date: workerHours.date,
        action: FeedbackAction.INCORRECT_TIME,
        createdAt: feedback.createdAt,
      });

      userSessions.delete(telegramId);
      await safeSendMessage(
        ctx,
        "Ваш запрос отправлен администраторам. Спасибо!"
      );
      await showMenus(ctx);
      return;
    }

    if (session?.awaitingFeedback) {
      const user = await userRepo.findOne({ where: { telegramId } });
      if (!user) {
        userSessions.delete(telegramId);
        await safeSendMessage(
          ctx,
          "Сначала вам нужно привязать аккаунт. Напишите /start."
        );
        return;
      }

      // Create feedback with user's message
      const feedback = new Feedback();
      feedback.userId = user.id;
      feedback.workerHoursId = 0; // General feedback, not tied to specific hours
      feedback.message = `Сообщение от ${user.name} (${ 
        ctx.from?.first_name || ""
      } ${ctx.from?.last_name || ""}): ${text}`;
      feedback.telegramUserId = telegramId;
      feedback.adminNotified = true;
      feedback.action =
        session.feedbackType === "hours_mistake"
          ? FeedbackAction.INCORRECT_TIME
          : FeedbackAction.LOGOUT;

      await feedbackRepo.save(feedback);

      // Notify admin via socket.io
      global.io.emit("newFeedback", {
        id: feedback.id,
        userName: user.name,
        userPosition: user.position,
        message: feedback.message,
        action: feedback.action,
        createdAt: feedback.createdAt,
      });

      // Clear session
      userSessions.delete(telegramId);

      await safeSendMessage(
        ctx,
        "✅ Ваше сообщение отправлено администраторам. Спасибо за обратную связь!\n\n" +
          "Администраторы рассмотрят вашу проблему и свяжутся с вами при необходимости."
      );

      await showMenus(ctx);
      return;
    }

    // Handle menu button presses
    const user = await userRepo.findOne({ where: { telegramId } });

    async function sendHistoryButtons() {
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth();

      const monthNames = [
        "Январь",
        "Февраль",
        "Март",
        "Апрель",
        "Май",
        "Июнь",
        "Июль",
        "Август",
        "Сентябрь",
        "Октябрь",
        "Ноябрь",
        "Декабрь",
      ];

      const inlineKeyboard = [];

      // Generate buttons for the last 12 months
      for (let i = 0; i < 12; i++) {
        const targetDate = new Date(currentYear, currentMonth - i, 1);
        const targetMonth = targetDate.getMonth();
        const targetYear = targetDate.getFullYear();

        inlineKeyboard.push([
          {
            text: `${monthNames[targetMonth]} ${targetYear}`,
            callback_data: `month_${targetMonth}_${targetYear}`,
          },
        ]);
      }

      await ctx.reply("Выберите месяц для просмотра рабочих часов:", {
        reply_markup: { inline_keyboard: inlineKeyboard },
      });
    }

    if (user) {
      if (text.includes("/last5days")) {
        await workerService.sendLast5DaysHours(user.id);
      }
      if (text.includes("/week")) {
        await workerService.sendWeekHours(user.id);
      }

      if (text.includes("/month")) {
        await workerService.sendMonthHours(user.id);
      }

      if (text.includes("/history")) {
        await sendHistoryButtons();
      }
    }

    if (!text || text.startsWith("/")) return;

    if (user) {
      switch (text) {
        case "📊 Последние 5 дней":
          await workerService.sendLast5DaysHours(user.id);
          return;
        case "📅 Текущая неделя":
          await workerService.sendWeekHours(user.id);
          return;
        case "📆 Текущий месяц":
          await workerService.sendMonthHours(user.id);
          return;
        case "🗓 История по месяцам":
          // Show month selection
          await sendHistoryButtons();
          return;
        case "💬 Сообщить о проблеме":
          await ctx.reply("Выберите тип проблемы:", {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "⏰ Ошибка в рабочих часах",
                    callback_data: "feedback_hours_mistake",
                  },
                ],
                [
                  {
                    text: "💬 Общий вопрос/проблема",
                    callback_data: "feedback_general",
                  },
                ],
                [{ text: "❌ Отмена", callback_data: "feedback_cancel" }],
              ],
            },
          });
          return;
      }
    }

    // If not a menu button, try enhanced user search
    const results = await enhancedUserSearch(userRepo, text);
    if (!results.length) {
      return safeSendMessage(
        ctx,
        '❌ Ничего не найдено по вашему запросу.\n💡 Попробуйте:\n• Полное имя: "Иван Петров"\n• Частичное совпадение: "Иван"\n• По должности: "менеджер"'
      );
    }

    // Limit results to prevent telegram limits
    const limitedResults = results.slice(0, 10);

    const inlineKeyboard = limitedResults.map((item: any) => [
      {
        text: `👤 ${item.name} | ${item.position || "Не указана"} | ID: ${
          item.id
        }`,
        callback_data: `select_${telegramId}_${item.id}`,
      },
    ]);

    if (results.length > 10) {
      inlineKeyboard.push([
        {
          text: `➕ Найдено еще ${
            results.length - 10
          } результатов. Уточните запрос`,
          callback_data: `more_results_info`,
        },
      ]);
    }

    await safeSendMessage(
      ctx,
      `🔍 Найдено: ${results.length} ${
        results.length === 1
          ? "пользователь"
          : results.length < 5
          ? "пользователя"
          : "пользователей"
      }\nВыберите из списка:`,
      {
        reply_markup: { inline_keyboard: inlineKeyboard },
      }
    );
  });

  // Callback queries
  bot.on("callback_query", async (ctx) => {
    const data = (ctx.callbackQuery as any).data || "";
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) return;

    // Log all callback queries for debugging
    console.log(`📞 Callback received: "${data}" from user ${telegramId}`);

    if (data.startsWith("feedback_")) {
      const feedbackAction = data.split("_")[1];

      const user = await userRepo.findOne({ where: { telegramId } });
      if (!user) {
        await ctx.reply(
          "Сначала вам нужно привязать аккаунт. Напишите /start."
        );
        return;
      }

      await safeAnswerCbQuery(ctx);

      switch (feedbackAction) {
        case "hours":
          await ctx.reply("⏰ Выберите тип проблемы с рабочими часами:", {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "❌ Неверное количество часов",
                    callback_data: "feedback_hours_mistake",
                  },
                ],
                [
                  {
                    text: "📅 Неверная дата",
                    callback_data: "feedback_hours_mistake",
                  },
                ],
                [
                  {
                    text: "📝 Неверное описание работы",
                    callback_data: "feedback_hours_mistake",
                  },
                ],
                [{ text: "🔙 Назад", callback_data: "action_feedback" }],
              ],
            },
          });
          break;

        case "hours_mistake":
          userSessions.set(telegramId, {
            awaitingFeedback: true,
            feedbackType: "hours_mistake",
          });
          await ctx.reply(
            "⏰ **Сообщить об ошибке в рабочих часах**\n\n" +
              "Пожалуйста, опишите проблему с вашими рабочими часами:\n" +
              "• Какая дата?\n" +
              "• Что неверно?\n" +
              "• Какими должны быть правильные данные?\n\n" +
              "Напишите ваше сообщение:"
          );
          break;

        case "general":
          userSessions.set(telegramId, {
            awaitingFeedback: true,
            feedbackType: "general",
          });
          await ctx.reply(
            "💬 **Общий вопрос или проблема**\n\n" +
              "Опишите вашу проблему или задайте вопрос.\n" +
              "Администраторы получат ваше сообщение и ответят при необходимости.\n\n" +
              "Напишите ваше сообщение:"
          );
          break;

        case "cancel":
          userSessions.delete(telegramId);
          await ctx.reply("❌ Отменено. Возвращаемся в главное меню.");
          await showMenus(ctx);
          break;
      }
      return;
    }

    // Handle menu actions
    if (data.startsWith("action_")) {
      const action = data.split("_")[1];

      const user = await userRepo.findOne({ where: { telegramId } });
      if (!user) {
        await ctx.reply(
          "Сначала вам нужно привязать аккаунт. Напишите /start."
        );
        return;
      }

      await safeAnswerCbQuery(ctx);

      console.log("action:", action);

      switch (action) {
        case "last5days":
          await workerService.sendLast5DaysHours(user.id);
          break;
        case "week":
          await workerService.sendWeekHours(user.id);
          break;
        case "month":
          await workerService.sendMonthHours(user.id);
          break;
        case "history":
          // Show month selection
          const now = new Date();
          const currentYear = now.getFullYear();
          const currentMonth = now.getMonth();

          const monthNames = [
            "Январь",
            "Февраль",
            "Март",
            "Апрель",
            "Май",
            "Июнь",
            "Июль",
            "Август",
            "Сентябрь",
            "Октябрь",
            "Ноябрь",
            "Декабрь",
          ];

          const inlineKeyboard = [];

          // Generate buttons for the last 12 months
          for (let i = 0; i < 12; i++) {
            const targetMonth = (currentMonth - i + 12) % 12;
            const targetYear =
              currentYear -
              Math.floor(i / 12) -
              (targetMonth > currentMonth ? 1 : 0);

            inlineKeyboard.push([
              {
                text: `${monthNames[targetMonth]} ${targetYear}`,
                callback_data: `month_${targetMonth}_${targetYear}`,
              },
            ]);
          }

          await ctx.reply("Выберите месяц для просмотра рабочих часов:", {
            reply_markup: { inline_keyboard: inlineKeyboard },
          });
          break;
        case "feedback":
          await ctx.reply("Выберите тип проблемы:", {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "⏰ Ошибка в рабочих часах",
                    callback_data: "feedback_hours_mistake",
                  },
                ],
                [
                  {
                    text: "💬 Общий вопрос/проблема",
                    callback_data: "feedback_general",
                  },
                ],
                [{ text: "❌ Отмена", callback_data: "feedback_cancel" }],
              ],
            },
          });
          break;
        default:
          await ctx.reply(
            "Неизвестное действие. Пожалуйста, попробуйте еще раз."
          );
      }

      return;
    }

    // correct_<userId>_<epochMs>  OR  incorrect_<userId>_<epochMs>
    if (data.startsWith("correct") || data.startsWith("incorrect")) {
      const [action, , epochStr] = data.split("_");
      const targetMs = Number(epochStr);
      const targetDate = normalizeDate(
        isNaN(targetMs) ? new Date() : new Date(targetMs)
      );

      await safeAnswerCbQuery(
        ctx,
        action === "correct" ? "Вы выбрали: Верно ✅" : "Вы выбрали: Неверно ❌"
      );

      const user = await userRepo.findOne({ where: { telegramId } });
      if (!user) {
        await ctx.reply(
          "Сначала вам нужно привязать аккаунт. Напишите /start."
        );
        return;
      }

      // Fetch that specific date's latest worker hours
      const workerHours = await workerHoursRepo.findOne({
        where: { userId: user.id, date: targetDate },
        order: { id: "DESC" },
      });

      if (!workerHours) {
        await ctx.reply("Запись рабочих часов на выбранную дату не найдена.");
        return;
      }

      if (action === "incorrect") {
        userSessions.set(telegramId, {
          awaitingHoursInput: { workerHoursId: workerHours.id },
        });
        await safeSendMessage(
          ctx,
          "Пожалуйста, введите правильное количество часов для выбранной даты:"
        );
      } else {
        await safeSendMessage(ctx, "Спасибо, вы подтвердили правильность.");
      }

      return;
    }

    // select_<telegramId>_<selectedUserId>
    if (data.startsWith("select_")) {
      try {
        console.log(
          `Processing select callback: ${data} from user: ${telegramId}`
        );
        const [, expectedUserId, selectedIdStr] = data.split("_");

        if (telegramId !== expectedUserId) {
          console.log(
            `User mismatch: expected ${expectedUserId}, got ${telegramId}`
          );
          await safeAnswerCbQuery(ctx, "Эта кнопка не для вас.", {
            show_alert: true,
          });
          return;
        }

        const selectedId = Number(selectedIdStr);
        if (Number.isNaN(selectedId)) {
          console.log(`Invalid selected ID: ${selectedIdStr}`);
          await safeAnswerCbQuery(ctx, "Некорректный ID.");
          return;
        }

        console.log(
          `Attempting to link user ID ${selectedId} to Telegram ${telegramId}`
        );

        // Check if this telegramId is already connected to another user
        const existingUser = await userRepo.findOne({ where: { telegramId } });
        if (existingUser && existingUser.id !== selectedId) {
          console.log(
            `User ${telegramId} already linked to ${existingUser.name} (ID: ${existingUser.id})`
          );
          await safeSendMessage(
            ctx,
            `Ваш Telegram аккаунт уже привязан к пользователю ${existingUser.name}. Для привязки к другому пользователю, необходимо сначала отвязать текущего пользователя.`,
            {
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: "Отправить запрос администратору на отвязку",
                      callback_data: `logout_request_${existingUser.id}`,
                    },
                  ],
                ],
              },
            }
          );
          return;
        }

        const user = await userRepo.findOne({ where: { id: selectedId } });
        if (!user) {
          console.log(`User not found with ID: ${selectedId}`);
          await safeAnswerCbQuery(ctx, "Пользователь не найден.");
          return;
        }

        // Check if the user is already linked to another Telegram account
        if (
          user.isLinked &&
          user.telegramId &&
          user.telegramId !== telegramId
        ) {
          console.log(
            `User ${user.name} (ID: ${user.id}) already linked to Telegram ${user.telegramId}`
          );
          await safeSendMessage(
            ctx,
            `❌ Пользователь **${user.name}** уже привязан к другому Telegram аккаунту.\n\n💡 Если это ваш аккаунт, попросите администратора отвязать его, а затем попробуйте снова.`
          );
          await safeAnswerCbQuery(ctx, "Пользователь уже привязан");
          return;
        }

        // Link the user
        user.telegramId = telegramId;
        user.isLinked = true;
        await userRepo.save(user);
        console.log(
          `Successfully linked user ${user.name} (ID: ${user.id}) to Telegram ${telegramId}`
        );

        // Send success message
        await safeSendMessage(
          ctx,
          `✅ **Успешная привязка!**\n\n👤 **Пользователь:** ${
            user.name
          }\n📊 **Должность:** ${user.position || "Не указана"}\n🆔 **ID:** ${
            user.id
          }\n\n🎉 Теперь вы будете получать ваши рабочие часы через этого бота!`
        );

        await safeAnswerCbQuery(ctx, "Привязка выполнена!");

        // Send current work hours
        try {
          await workerService.sendByUserId(user.id);
        } catch (error) {
          console.log("Error sending work hours:", error);
          await safeSendMessage(
            ctx,
            "⚠️ Привязка выполнена, но не удалось загрузить рабочие часы. Попробуйте позже."
          );
        }

        await showMenus(ctx);
        return;
      } catch (error) {
        console.error("Error in select callback handler:", error);
        await safeAnswerCbQuery(
          ctx,
          "Произошла ошибка при привязке. Попробуйте еще раз."
        );
        await safeSendMessage(
          ctx,
          "❌ Произошла ошибка при привязке аккаунта. Пожалуйста, попробуйте еще раз или обратитесь к администратору."
        );
        return;
      }
    }

    console.log("callback data:", data);

    // logout_request_<userId>
    if (data.startsWith("logout_request_")) {
      const [, , userIdStr] = data.split("_");
      const userId = Number(userIdStr);

      if (isNaN(userId)) {
        await safeAnswerCbQuery(ctx, "Некорректный ID пользователя.");
        return;
      }

      try {
        const user = await userRepo.findOne({ where: { id: userId } });
        if (!user) {
          await safeAnswerCbQuery(ctx, "Пользователь не найден.");
          return;
        }

        // Create a feedback with LOGOUT action
        const feedback = new Feedback();
        feedback.userId = userId;
        feedback.workerHoursId = 0; // Not related to worker hours
        feedback.message = `Запрос на отвязку Telegram аккаунта от пользователя ${user.name}. Telegram ID: ${telegramId}`;
        feedback.telegramUserId = telegramId;
        feedback.adminNotified = true;
        feedback.action = FeedbackAction.LOGOUT;

        await feedbackRepo.save(feedback);

        // Notify admin via socket.io
        global.io.emit("newFeedback", {
          id: feedback.id,
          userName: user.name,
          userPosition: user.position,
          message: feedback.message,
          action: FeedbackAction.LOGOUT,
          createdAt: feedback.createdAt,
        });

        await safeAnswerCbQuery(
          ctx,
          "Запрос на отвязку отправлен администратору."
        );
        await ctx.reply(
          "Ваш запрос на отвязку Telegram аккаунта отправлен администратору. Пожалуйста, ожидайте ответа."
        );
        return;
      } catch (error) {
        console.error("Logout request error:", error);
        await safeAnswerCbQuery(ctx, "Произошла ошибка при отправке запроса.");
        return;
      }
    }

    // Handle more results info button
    if (data === "more_results_info") {
      await safeAnswerCbQuery(
        ctx,
        "💡 Уточните поиск, введя больше букв или полное имя"
      );
      return;
    }

    // fallback for unknown callback data
    try {
      await ctx.answerCbQuery();
    } catch (error) {
      console.log("Callback query too old or invalid:", (error as any).message);
    }
  });

  // Command to show last 5 days hours
  bot.command("last5days", async (ctx: Context) => {
    const telegramId = ctx.from?.id.toString();
    console.log("last5days command:", telegramId);
    if (!telegramId) return;

    try {
      const user = await userRepo.findOne({ where: { telegramId } });
      if (!user) {
        await ctx.reply(
          "Сначала вам нужно привязать аккаунт. Напишите /start."
        );
        return;
      }

      await workerService.sendLast5DaysHours(user.id);
    } catch (error) {
      console.error("Error in last5days command:", error);
      await ctx.reply("Произошла ошибка. Пожалуйста, попробуйте еще раз.");
    }
  });

  // Command to show current week hours
  bot.command("week", async (ctx: Context) => {
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) return;

    try {
      const user = await userRepo.findOne({ where: { telegramId } });
      if (!user) {
        await ctx.reply(
          "Сначала вам нужно привязать аккаунт. Напишите /start."
        );
        return;
      }

      await workerService.sendWeekHours(user.id);
    } catch (error) {
      console.error("Error in week command:", error);
      await ctx.reply("Произошла ошибка. Пожалуйста, попробуйте еще раз.");
    }
  });

  // Command to show current month hours
  bot.command("month", async (ctx: Context) => {
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) return;

    try {
      const user = await userRepo.findOne({ where: { telegramId } });
      if (!user) {
        await ctx.reply(
          "Сначала вам нужно привязать аккаунт. Напишите /start."
        );
        return;
      }

      await workerService.sendMonthHours(user.id);
    } catch (error) {
      console.error("Error in month command:", error);
      await ctx.reply("Произошла ошибка. Пожалуйста, попробуйте еще раз.");
    }
  });

  // Command to show month selection for historical data
  bot.command("history", async (ctx: Context) => {
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) return;

    try {
      const user = await userRepo.findOne({ where: { telegramId } });
      if (!user) {
        await ctx.reply(
          "Сначала вам нужно привязать аккаунт. Напишите /start."
        );
        return;
      }

      // Create buttons for the last 12 months
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth();

      const monthNames = [
        "Январь",
        "Февраль",
        "Март",
        "Апрель",
        "Май",
        "Июнь",
        "Июль",
        "Август",
        "Сентябрь",
        "Октябрь",
        "Ноябрь",
        "Декабрь",
      ];

      const inlineKeyboard = [];

      // Generate buttons for the last 12 months
      for (let i = 0; i < 12; i++) {
        const targetDate = new Date(currentYear, currentMonth - i, 1);
        const targetMonth = targetDate.getMonth();
        const targetYear = targetDate.getFullYear();

        inlineKeyboard.push([
          {
            text: `${monthNames[targetMonth]} ${targetYear}`,
            callback_data: `month_${targetMonth}_${targetYear}`,
          },
        ]);
      }

      await ctx.reply("Выберите месяц для просмотра рабочих часов:", {
        reply_markup: { inline_keyboard: inlineKeyboard },
      });
    } catch (error) {
      console.error("Error in history command:", error);
      await ctx.reply("Произошла ошибка. Пожалуйста, попробуйте еще раз.");
    }
  });

  // Help command for search
  bot.command("search", async (ctx: Context) => {
    const helpText = `🔍 **Поиск сотрудников**

🎯 **Как искать:**
• **По имени:** \`Иван\`
• **По фамилии:** \`Петров\`
• **По полному имени:** \`Иван Петров\` или \`Петров Иван\`
• **По должности:** \`менеджер\`, \`директор\`
• **Частичное совпадение:** \`Ив\` найдет Ивана, Иванова

💡 **Советы:**
• Можно писать в любом регистре
• Порядок слов не важен
• Минимум 2 символа для поиска
• Показывается до 10 результатов

📝 **Просто напишите имя или фамилию сотрудника**`;

    await safeSendMessage(ctx, helpText);
  });

  // Main menu command
  bot.command("menu", async (ctx: Context) => {
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) return;

    try {
      const user = await userRepo.findOne({ where: { telegramId } });
      if (!user) {
        await ctx.reply(
          "Сначала вам нужно привязать аккаунт. Напишите /start."
        );
        return;
      }

      await showMenus(ctx);
    } catch (error) {
      console.error("Error in menu command:", error);
      await ctx.reply("Произошла ошибка. Пожалуйста, попробуйте еще раз.");
    }
  });

  bot.command("feedback", async (ctx: Context) => {
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) return;

    try {
      const user = await userRepo.findOne({ where: { telegramId } });
      if (!user) {
        await ctx.reply(
          "Сначала вам нужно привязать аккаунт. Напишите /start."
        );
        return;
      }

      await ctx.reply("Выберите тип проблемы:", {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "⏰ Ошибка в рабочих часах",
                callback_data: "feedback_hours_mistake",
              },
            ],
            [
              {
                text: "💬 Общий вопрос/проблема",
                callback_data: "feedback_general",
              },
            ],
            [{ text: "❌ Отмена", callback_data: "feedback_cancel" }],
          ],
        },
      });
    } catch (error) {
      console.error("Error in feedback command:", error);
      await ctx.reply("Произошла ошибка. Пожалуйста, попробуйте еще раз.");
    }
  });

  await bot.telegram.setMyCommands(
    [
      { command: "start", description: "Начать работу с ботом" },
      { command: "search", description: "Помощь по поиску сотрудников" },
      { command: "menu", description: "Показать меню" },
      { command: "last5days", description: "Часы за последние 5 дней" },
      { command: "week", description: "Часы за текущую неделю" },
      { command: "month", description: "Часы за текущий месяц" },
      { command: "history", description: "История по месяцам" },
      { command: "feedback", description: "Сообщить о проблеме" },
    ],
    { scope: { type: "default" } }
  );

  try {
    await bot.launch();
    console.log("Telegram bot started successfully");

    // Graceful stop
    process.once("SIGINT", () => bot.stop("SIGINT"));
    process.once("SIGTERM", () => bot.stop("SIGTERM"));
  } catch (error) {
    console.error("Failed to start Telegram bot:", error);
    // Don't throw - let the HTTP server start anyway
  }
}
