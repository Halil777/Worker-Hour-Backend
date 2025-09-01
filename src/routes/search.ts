// routes/search.ts
import { Router, Request, Response } from "express";
import { SearchService } from "../services/SearchService";

export const searchRouter = Router();
const svc = new SearchService();

searchRouter.get("/global", async (req: Request, res: Response) => {
  try {
    const { q, dateFrom, dateTo, page, limit } = req.query as Record<
      string,
      string | undefined
    >;
    const result = await svc.globalSearch({
      q,
      dateFrom,
      dateTo,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    console.error("Global search error:", err);
    res.status(500).json({ success: false, error: "Global search failed" });
  }
});
