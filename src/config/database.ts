import { DataSource } from 'typeorm';
import { User } from '../entities/User';
import { WorkerHours } from '../entities/WorkerHours';
import { Feedback } from '../entities/Feedback';
import { ExcelUpload } from '../entities/ExcelUpload';
import { InitialMigration1234567890123 } from '../migrations/1234567890123-InitialMigration';
import dotenv from "dotenv";

require('dotenv').config()
dotenv.config();

export const AppDataSource = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    synchronize: true, // Using migrations instead
    logging: true, // Enable logging to see what's happening
    entities: [User, WorkerHours, Feedback, ExcelUpload],
    // migrations: [InitialMigration1234567890123],
    // subscribers: [],
    // migrationsRun: true, // Automatically run migrations on startup
});
