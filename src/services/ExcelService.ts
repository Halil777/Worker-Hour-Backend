import * as XLSX from "xlsx";
import { AppDataSource } from "../config/database";
import { User } from "../entities/User";
import { WorkerHours } from "../entities/WorkerHours";
import { ExcelUpload } from "../entities/ExcelUpload";
import { WorkerService } from "./WorkerService";

export class ExcelService {
  private userRepo = AppDataSource.getRepository(User);
  private workerHoursRepo = AppDataSource.getRepository(WorkerHours);
  private excelUploadRepo = AppDataSource.getRepository(ExcelUpload);

  private conversionMap: { [key: number]: number } = {
    8: 8,
    10: 11,
    11: 12.5,
    12: 14,
    13: 15.5,
    14: 17,
    16: 16
  };

  private convertWorkingHours(hours: number): number {
    return this.conversionMap[hours] !== undefined ? this.conversionMap[hours] : hours;
  }

  async processExcelFile(
    filePath: string,
    originalName: string,
    targetDate: Date
  ): Promise<{ success: boolean; message: string; recordsProcessed?: number }> {
    try {
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      const data = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        raw: false,
        defval: "",
      }) as any[][];

      if (data.length < 2) {
        return {
          success: false,
          message: "Excel файл пуст или имеет неверный формат",
        };
      }

      const headers = data[0] as string[];
      const rows = data.slice(1);

      // 👉 Selected date from client
      const selectedDate = new Date(targetDate);
      selectedDate.setHours(0, 0, 0, 0);

      // Remove old entries for that date
      await this.workerHoursRepo.delete({ date: selectedDate });

      let recordsProcessed = 0;

      for (const row of rows) {
        if (row.length < headers.length) continue;

        try {
          const personalId = parseInt(row[0]?.toString() || "0");
          const name = row[1]?.toString() || "";
          const position = row[2]?.toString() || "";
          const activityCode = row[3]?.toString() || "";
          const activityDescription = row[4]?.toString() || "";
          const costCenter = row[5]?.toString() || "";
          const description = row[6]?.toString() || "";
          const team = row[6]?.toString() || ""; // if your file has team in another column, adjust
          const hoursValue = row[7];
          let hours =
            typeof hoursValue === "number"
              ? hoursValue
              : parseFloat(
                  hoursValue?.toString().trim().replace(",", ".") || "0"
                );

          // Apply working hours conversion
          hours = this.convertWorkingHours(hours);

          if (personalId && name) {
            // Upsert user
            let user = await this.userRepo.findOne({
              where: { id: personalId },
            });
            if (!user) {
              user = new User();
              user.id = personalId;
              user.name = name;
              user.position = position;
              user.isLinked = false;
              await this.userRepo.save(user);
            } else {
              user.name = name;
              user.position = position;
              await this.userRepo.save(user);
            }

            // Insert worker hours
            const workerHours = new WorkerHours();
            workerHours.userId = personalId;
            workerHours.date = selectedDate;
            workerHours.hours = hours;
            workerHours.activityCode = activityCode;
            workerHours.activityDescription = activityDescription;
            workerHours.costCenter = costCenter;
            workerHours.description = description;
            workerHours.team = team;
            workerHours.sent = false;

            await this.workerHoursRepo.save(workerHours);
            recordsProcessed++;
          }
        } catch (error) {
          console.error("Error processing row:", error);
          continue;
        }
      }

      // Log the upload
      const excelUpload = new ExcelUpload();
      excelUpload.filename = filePath;
      excelUpload.originalName = originalName;
      excelUpload.recordsCount = recordsProcessed;
      excelUpload.uploadDate = selectedDate;
      excelUpload.processed = true;
      await this.excelUploadRepo.save(excelUpload);

      // Send messages for the selected date (not "today")
      const workerService = new WorkerService();
      await workerService.sendDailyHoursToAllWorkers(selectedDate);

      return {
        success: true,
        message: `Excel файл успешно обработан для даты ${selectedDate}. Добавлено ${recordsProcessed} записей.`,
        recordsProcessed,
      };
    } catch (error) {
      console.error("Excel processing error:", error);
      return {
        success: false,
        message: "Ошибка при обработке Excel файла: " + error,
      };
    }
  }
}
