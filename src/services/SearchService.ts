// services/SearchService.ts
import { AppDataSource } from "../config/database";
import { User } from "../entities/User";
import { WorkerHours } from "../entities/WorkerHours";
import { Feedback } from "../entities/Feedback";
import { Brackets } from "typeorm";

type Page = number;
type Limit = number;

export interface GlobalSearchParams {
  q?: string;
  dateFrom?: string; // ISO yyyy-mm-dd
  dateTo?: string; // ISO yyyy-mm-dd
  page?: Page;
  limit?: Limit;
}

function like(q?: string) {
  return `%${(q ?? "").trim()}%`;
}

function parseDateSafe(s?: string): Date | undefined {
  if (!s) return undefined;
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : d;
}

function normalizeStartOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function normalizeEndOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export class SearchService {
  private userRepo = AppDataSource.getRepository(User);
  private workerHoursRepo = AppDataSource.getRepository(WorkerHours);
  private feedbackRepo = AppDataSource.getRepository(Feedback);

  async searchWorkers(params: GlobalSearchParams) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.max(1, Math.min(100, params.limit ?? 10));
    const q = params.q?.trim();

    const qb = this.userRepo
      .createQueryBuilder("u")
      .where(
        new Brackets((w) => {
          if (q && q.length > 0) {
            w.where("u.name ILIKE :q", { q: like(q) })
              .orWhere("u.position ILIKE :q", { q: like(q) })
              .orWhere("CAST(u.id AS TEXT) ILIKE :q", { q: like(q) })
              .orWhere("COALESCE(u.telegramId,'') ILIKE :q", { q: like(q) });
          }
        })
      )
      .orderBy("u.id", "DESC")
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();
    return {
      items,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async searchWorkerHours(params: GlobalSearchParams) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.max(1, Math.min(100, params.limit ?? 10));
    const q = params.q?.trim();
    const from = parseDateSafe(params.dateFrom);
    const to = parseDateSafe(params.dateTo);

    const qb = this.workerHoursRepo
      .createQueryBuilder("wh")
      // ✅ if WorkerHours has relation: @ManyToOne(() => User, user => user.workerHours)
      .leftJoinAndSelect("wh.user", "u")
      .where("1=1");

    if (q && q.length > 0) {
      qb.andWhere(
        new Brackets((w) => {
          w.where("u.name ILIKE :q", { q: like(q) })
            .orWhere("u.position ILIKE :q", { q: like(q) })
            .orWhere("CAST(wh.userId AS TEXT) ILIKE :q", { q: like(q) })
            .orWhere("COALESCE(wh.activityCode,'') ILIKE :q", { q: like(q) })
            .orWhere("COALESCE(wh.activityDescription,'') ILIKE :q", {
              q: like(q),
            })
            .orWhere("COALESCE(wh.costCenter,'') ILIKE :q", { q: like(q) })
            .orWhere("COALESCE(wh.description,'') ILIKE :q", { q: like(q) })
            .orWhere("COALESCE(wh.team,'') ILIKE :q", { q: like(q) });
        })
      );
    }

    if (from)
      qb.andWhere("wh.date >= :from", { from: normalizeStartOfDay(from) });
    if (to) qb.andWhere("wh.date <= :to", { to: normalizeEndOfDay(to) });

    qb.orderBy("wh.date", "DESC")
      .addOrderBy("wh.id", "DESC")
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();

    return {
      items, // each item already contains wh.user
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * TOTAL (aggregate) per user within date range, filtered by q
   */
  async searchTotals(params: GlobalSearchParams) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.max(1, Math.min(100, params.limit ?? 10));
    const q = params.q?.trim();
    const from = parseDateSafe(params.dateFrom);
    const to = parseDateSafe(params.dateTo);

    const qb = this.workerHoursRepo
      .createQueryBuilder("wh")
      .innerJoin(User, "u", "u.id = wh.userId")
      .select("u.id", "userId")
      .addSelect("u.name", "name")
      .addSelect("u.position", "position")
      .addSelect("SUM(wh.hours)", "totalHours")
      .addSelect("COUNT(wh.id)", "recordsCount")
      .addSelect("MIN(wh.date)", "firstDate")
      .addSelect("MAX(wh.date)", "lastDate")
      .where("1=1");

    if (q && q.length > 0) {
      qb.andWhere(
        new Brackets((w) => {
          w.where("u.name ILIKE :q", { q: like(q) })
            .orWhere("u.position ILIKE :q", { q: like(q) })
            .orWhere("CAST(u.id AS TEXT) ILIKE :q", { q: like(q) })
            .orWhere("COALESCE(wh.activityCode,'') ILIKE :q", { q: like(q) })
            .orWhere("COALESCE(wh.activityDescription,'') ILIKE :q", {
              q: like(q),
            })
            .orWhere("COALESCE(wh.costCenter,'') ILIKE :q", { q: like(q) })
            .orWhere("COALESCE(wh.description,'') ILIKE :q", { q: like(q) })
            .orWhere("COALESCE(wh.team,'') ILIKE :q", { q: like(q) });
        })
      );
    }

    if (from)
      qb.andWhere("wh.date >= :from", { from: normalizeStartOfDay(from) });
    if (to) qb.andWhere("wh.date <= :to", { to: normalizeEndOfDay(to) });

    qb.groupBy("u.id")
      .addGroupBy("u.name")
      .addGroupBy("u.position")
      .orderBy("SUM(wh.hours)", "DESC")
      .offset((page - 1) * limit)
      .limit(limit);

    const rows = await qb.getRawMany();

    // Count distinct groups safely (getRawOne may return undefined)
    const totalGroupsQb = this.workerHoursRepo
      .createQueryBuilder("wh")
      .innerJoin(User, "u", "u.id = wh.userId")
      .select("COUNT(DISTINCT u.id)", "cnt")
      .where("1=1");

    if (q && q.length > 0) {
      totalGroupsQb.andWhere(
        new Brackets((w) => {
          w.where("u.name ILIKE :q", { q: like(q) })
            .orWhere("u.position ILIKE :q", { q: like(q) })
            .orWhere("CAST(u.id AS TEXT) ILIKE :q", { q: like(q) })
            .orWhere("COALESCE(wh.activityCode,'') ILIKE :q", { q: like(q) })
            .orWhere("COALESCE(wh.activityDescription,'') ILIKE :q", {
              q: like(q),
            })
            .orWhere("COALESCE(wh.costCenter,'') ILIKE :q", { q: like(q) })
            .orWhere("COALESCE(wh.description,'') ILIKE :q", { q: like(q) })
            .orWhere("COALESCE(wh.team,'') ILIKE :q", { q: like(q) });
        })
      );
    }

    if (from)
      totalGroupsQb.andWhere("wh.date >= :from", {
        from: normalizeStartOfDay(from),
      });
    if (to)
      totalGroupsQb.andWhere("wh.date <= :to", { to: normalizeEndOfDay(to) });

    const raw = await totalGroupsQb.getRawOne<{ cnt: string }>(); // may be undefined
    const total = Number(raw?.cnt ?? 0); // ✅ safe access

    return {
      items: rows.map((r) => ({
        userId: Number(r.userId),
        name: r.name,
        position: r.position,
        totalHours: Number(r.totalHours ?? 0),
        recordsCount: Number(r.recordsCount ?? 0),
        firstDate: r.firstDate ? new Date(r.firstDate) : null,
        lastDate: r.lastDate ? new Date(r.lastDate) : null,
      })),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async searchFeedback(params: GlobalSearchParams) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.max(1, Math.min(100, params.limit ?? 10));
    const q = params.q?.trim();
    const from = parseDateSafe(params.dateFrom);
    const to = parseDateSafe(params.dateTo);

    const qb = this.feedbackRepo
      .createQueryBuilder("f")
      // if Feedback has relations defined, you can map them like:
      // .leftJoinAndSelect("f.user", "u")
      // .leftJoinAndSelect("f.workerHours", "wh")
      // but using raw joins also works:
      .leftJoinAndSelect(User, "u", "u.id = f.userId")
      .leftJoinAndSelect(WorkerHours, "wh", "wh.id = f.workerHoursId")
      .where("1=1");

    if (q && q.length > 0) {
      qb.andWhere(
        new Brackets((w) => {
          w.where("COALESCE(f.message,'') ILIKE :q", { q: like(q) })
            .orWhere("u.name ILIKE :q", { q: like(q) })
            .orWhere("u.position ILIKE :q", { q: like(q) })
            .orWhere("CAST(u.id AS TEXT) ILIKE :q", { q: like(q) });
        })
      );
    }

    if (from)
      qb.andWhere("f.createdAt >= :from", { from: normalizeStartOfDay(from) });
    if (to) qb.andWhere("f.createdAt <= :to", { to: normalizeEndOfDay(to) });

    qb.orderBy("f.createdAt", "DESC")
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();
    return {
      items,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async globalSearch(params: GlobalSearchParams) {
    const [workers, workerHours, totals, feedback] = await Promise.all([
      this.searchWorkers(params),
      this.searchWorkerHours(params),
      this.searchTotals(params),
      this.searchFeedback(params),
    ]);

    return {
      query: params.q ?? "",
      dateFrom: params.dateFrom ?? null,
      dateTo: params.dateTo ?? null,
      workers,
      workerHours,
      totals,
      feedback,
    };
  }
}
