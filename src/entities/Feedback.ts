import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { User } from "./User";
import { WorkerHours } from "./WorkerHours";

export enum FeedbackAction {
  LOGOUT = "LOGOUT",
  INCORRECT_TIME = "INCORRECT_TIME",
}

@Entity("feedbacks")
export class Feedback {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @Column()
  workerHoursId: number;

  @Column("text")
  message: string;

  @Column()
  telegramUserId: string;

  @Column({ default: false })
  adminNotified: boolean;

  @Column({
    type: "enum",
    enum: FeedbackAction,
    default: FeedbackAction.INCORRECT_TIME,
  })
  action: FeedbackAction;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => User, (user) => user.feedbacks)
  @JoinColumn({ name: "userId" })
  user: User;

  // 🔥 täze relation
  @ManyToOne(() => WorkerHours, (wh) => wh.feedbacks, { eager: true })
  @JoinColumn({ name: "workerHoursId" })
  workerHours: WorkerHours;
}
