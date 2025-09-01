import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('excel_uploads')
export class ExcelUpload {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    filename: string;

    @Column()
    originalName: string;

    @Column()
    recordsCount: number;

    @Column()
    uploadDate: Date;

    @Column({ default: false })
    processed: boolean;

    @CreateDateColumn()
    createdAt: Date;
}