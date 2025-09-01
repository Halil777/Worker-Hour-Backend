import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from "typeorm";
import { User } from "./User";
import { Feedback } from "./Feedback";

@Entity("worker_hours")
export class WorkerHours {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @Column({
    type: "date",
  })
  date: Date;

  @Column("decimal", { precision: 4, scale: 2 })
  hours: number;

  @Column()
  activityCode: string;

  @Column()
  activityDescription: string;

  @Column()
  costCenter: string;

  @Column()
  description: string;

  @Column()
  team: string;

  @Column({ default: false })
  sent: boolean;

  @Column({ nullable: true })
  sentAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => User, (user) => user.workerHours)
  @JoinColumn({ name: "userId" })
  user: User;

  @OneToMany(() => Feedback, (f) => f.workerHours)
  feedbacks: Feedback[];
}
