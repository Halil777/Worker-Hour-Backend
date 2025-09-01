import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialMigration1234567890123 implements MigrationInterface {
    name = 'InitialMigration1234567890123'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Check and create users table
        const usersTableExists = await queryRunner.hasTable("users");
        if (!usersTableExists) {
            await queryRunner.query(`
                CREATE TABLE "users" (
                    "id" integer NOT NULL,
                    "telegramId" character varying,
                    "name" character varying NOT NULL,
                    "position" character varying NOT NULL,
                    "isLinked" boolean NOT NULL DEFAULT false,
                    "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                    "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                    CONSTRAINT "PK_users_id" PRIMARY KEY ("id")
                )
            `);
            console.log('✅ Created users table');
        } else {
            console.log('ℹ️ Users table already exists, skipping...');
        }

        // Check and create worker_hours table
        const workerHoursTableExists = await queryRunner.hasTable("worker_hours");
        if (!workerHoursTableExists) {
            await queryRunner.query(`
                CREATE TABLE "worker_hours" (
                    "id" SERIAL NOT NULL,
                    "userId" integer NOT NULL,
                    "date" date NOT NULL,
                    "hours" numeric(4,2) NOT NULL,
                    "activityCode" character varying NOT NULL,
                    "activityDescription" character varying NOT NULL,
                    "costCenter" character varying NOT NULL,
                    "description" character varying NOT NULL,
                    "team" character varying NOT NULL,
                    "sent" boolean NOT NULL DEFAULT false,
                    "sentAt" TIMESTAMP,
                    "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                    CONSTRAINT "PK_worker_hours_id" PRIMARY KEY ("id")
                )
            `);
            console.log('✅ Created worker_hours table');
        } else {
            console.log('ℹ️ Worker_hours table already exists, skipping...');
        }

        // Check and create feedbacks table
        const feedbacksTableExists = await queryRunner.hasTable("feedbacks");
        if (!feedbacksTableExists) {
            await queryRunner.query(`
                CREATE TABLE "feedbacks" (
                    "id" SERIAL NOT NULL,
                    "userId" integer NOT NULL,
                    "workerHoursId" integer NOT NULL,
                    "message" text NOT NULL,
                    "telegramMessageId" integer NOT NULL,
                    "adminNotified" boolean NOT NULL DEFAULT false,
                    "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                    CONSTRAINT "PK_feedbacks_id" PRIMARY KEY ("id")
                )
            `);
            console.log('✅ Created feedbacks table');
        } else {
            console.log('ℹ️ Feedbacks table already exists, skipping...');
        }

        // Check and create excel_uploads table
        const excelUploadsTableExists = await queryRunner.hasTable("excel_uploads");
        if (!excelUploadsTableExists) {
            await queryRunner.query(`
                CREATE TABLE "excel_uploads" (
                    "id" SERIAL NOT NULL,
                    "filename" character varying NOT NULL,
                    "originalName" character varying NOT NULL,
                    "recordsCount" integer NOT NULL,
                    "uploadDate" TIMESTAMP NOT NULL,
                    "processed" boolean NOT NULL DEFAULT false,
                    "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                    CONSTRAINT "PK_excel_uploads_id" PRIMARY KEY ("id")
                )
            `);
            console.log('✅ Created excel_uploads table');
        } else {
            console.log('ℹ️ Excel_uploads table already exists, skipping...');
        }

        // Add foreign key constraints (check if they don't exist first)
        const workerHoursFKExists = await queryRunner.hasColumn("worker_hours", "userId") &&
            await queryRunner.hasTable("users");
        if (workerHoursFKExists) {
            try {
                await queryRunner.query(`
                    ALTER TABLE "worker_hours" 
                    ADD CONSTRAINT "FK_worker_hours_userId" 
                    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
                `);
                console.log('✅ Added worker_hours foreign key constraint');
            } catch (error) {
                if (!(error as any).message.includes('already exists')) {
                    console.log('ℹ️ Worker_hours FK constraint already exists or error:', (error as any).message);
                }
            }
        }

        const feedbacksFKExists = await queryRunner.hasColumn("feedbacks", "userId") &&
            await queryRunner.hasTable("users");
        if (feedbacksFKExists) {
            try {
                await queryRunner.query(`
                    ALTER TABLE "feedbacks" 
                    ADD CONSTRAINT "FK_feedbacks_userId" 
                    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
                `);
                console.log('✅ Added feedbacks foreign key constraint');
            } catch (error) {
                if (!(error as any).message.includes('already exists')) {
                    console.log('ℹ️ Feedbacks FK constraint already exists or error:', (error as any).message);
                }
            }
        }

        // Add indexes (with existence checks)
        const indexesToCreate = [
            { table: 'users', column: 'telegramId', name: 'IDX_users_telegramId' },
            { table: 'users', column: 'isLinked', name: 'IDX_users_isLinked' },
            { table: 'worker_hours', column: 'userId', name: 'IDX_worker_hours_userId' },
            { table: 'worker_hours', column: 'date', name: 'IDX_worker_hours_date' },
            { table: 'worker_hours', column: 'sent', name: 'IDX_worker_hours_sent' },
            { table: 'feedbacks', column: 'userId', name: 'IDX_feedbacks_userId' },
            { table: 'feedbacks', column: 'adminNotified', name: 'IDX_feedbacks_adminNotified' }
        ];

        for (const index of indexesToCreate) {
            try {
                await queryRunner.query(`CREATE INDEX "${index.name}" ON "${index.table}" ("${index.column}")`);
                console.log(`✅ Created index ${index.name}`);
            } catch (error) {
                if ((error as any).message.includes('already exists')) {
                    console.log(`ℹ️ Index ${index.name} already exists, skipping...`);
                } else {
                    console.log(`⚠️ Error creating index ${index.name}:`, (error as any).message);
                }
            }
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop foreign key constraints (if they exist)
        try {
            await queryRunner.query(`ALTER TABLE "feedbacks" DROP CONSTRAINT IF EXISTS "FK_feedbacks_userId"`);
        } catch (error) {
            console.log('Note: FK_feedbacks_userId constraint may not exist');
        }

        try {
            await queryRunner.query(`ALTER TABLE "worker_hours" DROP CONSTRAINT IF EXISTS "FK_worker_hours_userId"`);
        } catch (error) {
            console.log('Note: FK_worker_hours_userId constraint may not exist');
        }

        // Drop indexes (if they exist)
        const indexesToDrop = [
            'IDX_feedbacks_adminNotified',
            'IDX_feedbacks_userId',
            'IDX_worker_hours_sent',
            'IDX_worker_hours_date',
            'IDX_worker_hours_userId',
            'IDX_users_isLinked',
            'IDX_users_telegramId'
        ];

        for (const indexName of indexesToDrop) {
            try {
                await queryRunner.query(`DROP INDEX IF EXISTS "${indexName}"`);
            } catch (error) {
                console.log(`Note: Index ${indexName} may not exist`);
            }
        }

        // Drop tables (if they exist)
        await queryRunner.query(`DROP TABLE IF EXISTS "excel_uploads"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "feedbacks"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "worker_hours"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "users"`);

        console.log('✅ Migration rollback completed');
    }
}