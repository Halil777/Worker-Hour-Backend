import request from 'supertest';
import { Express } from 'express';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { AppDataSource } from '../src/config/database';
import { setupRoutes } from '../src/routes';
import { User } from '../src/entities/User';
import { Feedback } from '../src/entities/Feedback';
import { ExcelUpload } from '../src/entities/ExcelUpload';
import { WorkerHours } from '../src/entities/WorkerHours';
import path from 'path';
import fs from 'fs';

// Mock socket.io
jest.mock('socket.io', () => {
  return {
    Server: jest.fn().mockImplementation(() => ({
      on: jest.fn(),
      emit: jest.fn()
    }))
  };
});

// Mock global.io
global.io = {
  emit: jest.fn()
} as any;

// Mock database connection
jest.mock('../src/config/database', () => {
  const mockRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    count: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
      getRawOne: jest.fn().mockResolvedValue({}),
      getCount: jest.fn().mockResolvedValue(0)
    })
  };

  return {
    AppDataSource: {
      initialize: jest.fn().mockResolvedValue({}),
      runMigrations: jest.fn().mockResolvedValue({}),
      getRepository: jest.fn().mockReturnValue(mockRepository)
    }
  };
});

// Mock services
jest.mock('../src/services/WorkerService', () => {
  return {
    WorkerService: jest.fn().mockImplementation(() => ({
      updateWorkingHours: jest.fn().mockResolvedValue({}),
      sendByUserId: jest.fn().mockResolvedValue({}),
      sendDailyHoursToAllWorkers: jest.fn().mockResolvedValue({ success: true, message: 'Success', sentCount: 5 }),
      sendFiveDaysStats: jest.fn().mockResolvedValue({}),
      getWorkerHoursList: jest.fn().mockResolvedValue({ success: true, data: [], total: 0 }),
      getUserWorkingHoursSum: jest.fn().mockResolvedValue({ success: true, data: [] })
    }))
  };
});

jest.mock('../src/services/ExcelService', () => {
  return {
    ExcelService: jest.fn().mockImplementation(() => ({
      processExcelFile: jest.fn().mockResolvedValue({ success: true, message: 'Success', recordsProcessed: 10 })
    }))
  };
});

jest.mock('../src/services/SearchService', () => {
  return {
    SearchService: jest.fn().mockImplementation(() => ({
      globalSearch: jest.fn().mockResolvedValue({ data: [], total: 0 })
    }))
  };
});

// Mock multer
jest.mock('multer', () => {
  const multer = () => ({
    single: () => (req: any, res: any, next: any) => {
      req.file = {
        path: 'uploads/test.xlsx',
        originalname: 'test.xlsx'
      };
      next();
    }
  });
  multer.diskStorage = jest.fn();
  return multer;
});

describe('API Endpoints', () => {
  let app: Express;
  let server: any;

  beforeAll(async () => {
    app = express();
    server = createServer(app);
    
    app.use(cors());
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    
    // Setup routes
    setupRoutes(app);
  });

  afterAll(() => {
    server.close();
  });

  // Health check endpoint
  describe('GET /health', () => {
    it('should return status 200 and OK message', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'OK');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  // Upload Excel file endpoint
  describe('POST /admin/upload-excel', () => {
    it('should process Excel file and return success', async () => {
      const response = await request(app)
        .post('/admin/upload-excel')
        .field('targetDate', '2023-01-01')
        .attach('excel', Buffer.from('fake excel content'), 'test.xlsx');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('recordsProcessed');
    });

    it('should return error if target date is missing', async () => {
      const response = await request(app)
        .post('/admin/upload-excel')
        .attach('excel', Buffer.from('fake excel content'), 'test.xlsx');
      
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });

  // Response to user message endpoint
  describe('POST /admin/response-user-message', () => {
    it('should respond to user message successfully', async () => {
      const response = await request(app)
        .post('/admin/response-user-message')
        .send({
          userId: 1,
          message: 'Test message',
          hours: 8
        });
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
    });
  });

  // Send daily hours manually endpoint
  describe('POST /admin/send-daily-hours', () => {
    it('should send daily hours to all workers', async () => {
      const response = await request(app)
        .post('/admin/send-daily-hours');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('sentCount');
    });
  });

  // Get all users endpoint
  describe('GET /admin/users', () => {
    it('should return list of users', async () => {
      const mockUsers = [
        { id: 1, name: 'User 1', telegramId: '123', position: 'Developer' },
        { id: 2, name: 'User 2', telegramId: '456', position: 'Manager' }
      ];
      
      // Mock the repository response
      (AppDataSource.getRepository as jest.Mock).mockImplementation(() => ({
        find: jest.fn().mockResolvedValue(mockUsers)
      }));
      
      const response = await request(app).get('/admin/users');
      
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  // Get all feedbacks endpoint
  describe('GET /admin/feedbacks', () => {
    it('should return list of feedbacks', async () => {
      const mockFeedbacks = [
        { id: 1, userId: 1, message: 'Feedback 1', user: { name: 'User 1' } },
        { id: 2, userId: 2, message: 'Feedback 2', user: { name: 'User 2' } }
      ];
      
      // Mock the repository response
      (AppDataSource.getRepository as jest.Mock).mockImplementation(() => ({
        find: jest.fn().mockResolvedValue(mockFeedbacks)
      }));
      
      const response = await request(app).get('/admin/feedbacks');
      
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  // Get upload history endpoint
  describe('GET /admin/uploads', () => {
    it('should return list of uploads', async () => {
      const mockUploads = [
        { id: 1, filename: 'file1.xlsx', originalFilename: 'original1.xlsx', recordsProcessed: 10 },
        { id: 2, filename: 'file2.xlsx', originalFilename: 'original2.xlsx', recordsProcessed: 20 }
      ];
      
      // Mock the repository response
      (AppDataSource.getRepository as jest.Mock).mockImplementation(() => ({
        find: jest.fn().mockResolvedValue(mockUploads)
      }));
      
      const response = await request(app).get('/admin/uploads');
      
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  // Get statistics endpoint
  describe('GET /admin/stats', () => {
    it('should return statistics', async () => {
      // Mock the repository responses
      (AppDataSource.getRepository as jest.Mock).mockImplementation((entity) => {
        if (entity === User) {
          return {
            count: jest.fn()
              .mockResolvedValueOnce(10) // totalUsers
              .mockResolvedValueOnce(7)  // linkedUsers
          };
        } else if (entity === Feedback) {
          return {
            count: jest.fn().mockResolvedValue(5) // todayFeedbacks
          };
        }
        return { count: jest.fn().mockResolvedValue(0) };
      });
      
      const response = await request(app).get('/admin/stats');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('totalUsers');
      expect(response.body).toHaveProperty('linkedUsers');
      expect(response.body).toHaveProperty('unlinkedUsers');
      expect(response.body).toHaveProperty('todayFeedbacks');
    });
  });

  // Get worker hours list endpoint
  describe('GET /admin/worker-hours', () => {
    it('should return worker hours list with pagination', async () => {
      const response = await request(app)
        .get('/admin/worker-hours')
        .query({ page: 1, limit: 10, search: 'test' });
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
    });
  });

  // Get sum of working hours endpoint
  describe('GET /admin/user-hours-sum', () => {
    it('should return sum of working hours for each user', async () => {
      const response = await request(app)
        .get('/admin/user-hours-sum')
        .query({ startDate: '2023-01-01', endDate: '2023-01-31' });
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
    });

    it('should return error for invalid date format', async () => {
      const response = await request(app)
        .get('/admin/user-hours-sum')
        .query({ startDate: 'invalid-date', endDate: '2023-01-31' });
      
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });

  // Global search endpoint
  describe('GET /admin/search/global', () => {
    it('should return search results', async () => {
      const response = await request(app)
        .get('/admin/search/global')
        .query({ q: 'test', dateFrom: '2023-01-01', dateTo: '2023-01-31', page: 1, limit: 10 });
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
    });
  });
});