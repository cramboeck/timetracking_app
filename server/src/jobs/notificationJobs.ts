import cron from 'node-cron';
import { db, queries } from '../config/database';
import { emailService } from '../services/emailService';

export function startNotificationJobs() {
  if (process.env.NOTIFICATIONS_ENABLED !== 'true') {
    console.log('📭 Notifications disabled');
    return;
  }

  // Run every hour
  cron.schedule('0 * * * *', async () => {
    console.log('🔔 Running notification checks...');

    try {
      const users = db.prepare('SELECT * FROM users').all() as any[];

      for (const user of users) {
        const now = new Date();
        const hour = now.getHours();

        // 1. Month-end reminder (3 days before)
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const daysRemaining = daysInMonth - now.getDate();

        if (daysRemaining <= 3 && daysRemaining >= 0) {
          if (emailService.canSendNotification(user.id, 'month_end', 24)) {
            await emailService.sendMonthEndReminderEmail({
              userId: user.id,
              userName: user.username,
              userEmail: user.email,
              daysRemaining
            });
          }
        }

        // 2. Daily reminder (18:00-22:00, no entries today)
        if (hour >= 18 && hour <= 22) {
          const today = now.toISOString().split('T')[0];
          const entries = db.prepare(`
            SELECT * FROM time_entries
            WHERE user_id = ? AND DATE(start_time) = ? AND is_running = 0
          `).all(user.id, today);

          if (entries.length === 0 && emailService.canSendNotification(user.id, 'daily_reminder', 24)) {
            await emailService.sendDailyReminderEmail({
              userId: user.id,
              userName: user.username,
              userEmail: user.email
            });
          }
        }

        // 3. Quality check (weekly)
        const entriesWithoutDesc = db.prepare(`
          SELECT COUNT(*) as count FROM time_entries
          WHERE user_id = ? AND (description IS NULL OR description = '') AND is_running = 0
        `).get(user.id) as any;

        if (entriesWithoutDesc.count > 0 && emailService.canSendNotification(user.id, 'quality_check', 168)) {
          await emailService.sendQualityCheckEmail({
            userId: user.id,
            userName: user.username,
            userEmail: user.email,
            missingCount: entriesWithoutDesc.count
          });
        }

        // 4. Weekly report (Friday 16:00-18:00)
        const dayOfWeek = now.getDay();
        if (dayOfWeek === 5 && hour >= 16 && hour <= 18) {
          if (emailService.canSendNotification(user.id, 'weekly_report', 168)) {
            const weekStart = new Date(now);
            weekStart.setDate(now.getDate() - now.getDay() + 1);
            weekStart.setHours(0, 0, 0, 0);

            const entries = db.prepare(`
              SELECT te.*, p.name as project_name
              FROM time_entries te
              LEFT JOIN projects p ON te.project_id = p.id
              WHERE te.user_id = ? AND te.start_time >= ? AND te.is_running = 0
              ORDER BY te.start_time DESC
            `).all(user.id, weekStart.toISOString()) as any[];

            const totalHours = entries.reduce((sum, e) => sum + (e.duration / 3600), 0);

            await emailService.sendWeeklyReportEmail({
              userId: user.id,
              userName: user.username,
              userEmail: user.email,
              totalHours,
              entries
            });
          }
        }
      }

      console.log('✅ Notification checks complete');
    } catch (error) {
      console.error('❌ Error running notification jobs:', error);
    }
  });

  console.log('✅ Notification jobs started');
}
