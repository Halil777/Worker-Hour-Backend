import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from "typeorm";
import { WorkerHours } from "./WorkerHours";
import { Feedback } from "./Feedback";

@Entity("users")
export class User {
  @PrimaryColumn()
  id: number; // Your internal user ID

  @Column("varchar", { nullable: true }) // <-- type eklendi
  telegramId: string | null;

  @Column()
  name: string;

  @Column()
  position: string;

  @Column({ default: false })
  isLinked: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => WorkerHours, (workerHours) => workerHours.user)
  workerHours: WorkerHours[];

  @OneToMany(() => Feedback, (feedback) => feedback.user)
  feedbacks: Feedback[];
}
