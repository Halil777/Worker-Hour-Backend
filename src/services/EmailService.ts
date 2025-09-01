import tls from 'tls';
import { Feedback } from '../entities/Feedback';
import { User } from '../entities/User';
import { WorkerHours } from '../entities/WorkerHours';

export class EmailService {
  async sendFeedbackNotification(feedback: Feedback, user: User, workerHours?: WorkerHours) {
    try {
      const emailUser = process.env.EMAIL_USER;
      const emailPass = process.env.EMAIL_PASS;
      const recipients = (process.env.EMAIL_RECIPIENTS || '')
        .split(',')
        .map(r => r.trim())
        .filter(Boolean);

      if (!emailUser || !emailPass || recipients.length === 0) {
        return;
      }

      let body = `${feedback.message}`;
      if (workerHours) {
        const date = workerHours.date.toISOString().split('T')[0];
        body += `\nДата: ${date}\nЧасы: ${workerHours.hours}`;
      }

      const message = [
        `From: ${emailUser}`,
        `To: ${recipients.join(', ')}`,
        'Subject: New feedback',
        '',
        body
      ].join('\r\n');

      await this.sendMail(emailUser, emailPass, recipients, message);
    } catch (error) {
      console.error('Email send error:', error);
    }
  }

  private sendMail(user: string, pass: string, recipients: string[], message: string) {
    return new Promise<void>((resolve) => {
      const client = tls.connect(465, 'smtp.gmail.com', { rejectUnauthorized: false }, () => {
        const commands = [
          'EHLO localhost',
          'AUTH LOGIN',
          Buffer.from(user).toString('base64'),
          Buffer.from(pass).toString('base64'),
          `MAIL FROM:<${user}>`,
          ...recipients.map(r => `RCPT TO:<${r}>`),
          'DATA',
          `${message}\r\n.`,
          'QUIT'
        ];

        const send = () => {
          const cmd = commands.shift();
          if (cmd) {
            client.write(cmd + '\r\n');
          } else {
            client.end();
          }
        };

        client.on('data', () => send());
        client.on('end', () => resolve());
        client.on('error', () => resolve());
        send();
      });
    });
  }
}
