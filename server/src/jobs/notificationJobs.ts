import cron from 'node-cron';
import { pool } from '../config/database';
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
      const usersResult = await pool.query('SELECT * FROM users');
      const users = usersResult.rows;

      for (const user of users) {
        const now = new Date();
        const hour = now.getHours();

        // 1. Month-end reminder (3 days before)
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const daysRemaining = daysInMonth - now.getDate();

        if (daysRemaining <= 3 && daysRemaining >= 0) {
          if (await emailService.canSendNotification(user.id, 'month_end', 24)) {
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
          const entriesResult = await pool.query(`
            SELECT * FROM time_entries
            WHERE user_id = $1 AND DATE(start_time) = $2 AND is_running = false
          `, [user.id, today]);
          const entries = entriesResult.rows;

          if (entries.length === 0 && await emailService.canSendNotification(user.id, 'daily_reminder', 24)) {
            await emailService.sendDailyReminderEmail({
              userId: user.id,
              userName: user.username,
              userEmail: user.email
            });
          }
        }

        // 3. Quality check (weekly)
        const entriesWithoutDescResult = await pool.query(`
          SELECT COUNT(*) as count FROM time_entries
          WHERE user_id = $1 AND (description IS NULL OR description = '') AND is_running = false
        `, [user.id]);
        const entriesWithoutDesc = entriesWithoutDescResult.rows[0];

        if (entriesWithoutDesc.count > 0 && await emailService.canSendNotification(user.id, 'quality_check', 168)) {
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
          if (await emailService.canSendNotification(user.id, 'weekly_report', 168)) {
            const weekStart = new Date(now);
            weekStart.setDate(now.getDate() - now.getDay() + 1);
            weekStart.setHours(0, 0, 0, 0);

            const entriesResult = await pool.query(`
              SELECT te.*, p.name as project_name
              FROM time_entries te
              LEFT JOIN projects p ON te.project_id = p.id
              WHERE te.user_id = $1 AND te.start_time >= $2 AND te.is_running = false
              ORDER BY te.start_time DESC
            `, [user.id, weekStart.toISOString()]);
            const entries = entriesResult.rows;

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

  // Report approval reminders - run twice daily at 9:00 and 15:00
  cron.schedule('0 9,15 * * *', async () => {
    console.log('🔔 Running report approval reminder checks...');

    try {
      // Get pending approvals that expire in 2 days or less and haven't had a reminder sent recently
      const result = await pool.query(
        `SELECT ra.*, u.username as sender_name, u.email as sender_email
         FROM report_approvals ra
         JOIN users u ON ra.user_id = u.id
         WHERE ra.status = 'pending'
           AND ra.expires_at > NOW()
           AND ra.expires_at <= NOW() + INTERVAL '2 days'
           AND (ra.reminder_sent_at IS NULL OR ra.reminder_sent_at < NOW() - INTERVAL '1 day')
         ORDER BY ra.expires_at ASC
         LIMIT 50`
      );

      let remindersSent = 0;

      for (const approval of result.rows) {
        try {
          const expiresAt = new Date(approval.expires_at);
          const daysUntilExpiry = Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          const approvalUrl = `${process.env.FRONTEND_URL}/approve/${approval.token}`;

          const emailSent = await emailService.sendReportApprovalReminder({
            to: approval.recipient_email,
            recipientName: approval.recipient_name,
            senderName: approval.sender_name,
            reportData: approval.report_data,
            approvalUrl,
            expiresAt,
            daysUntilExpiry
          });

          if (emailSent) {
            await pool.query(
              `UPDATE report_approvals SET reminder_sent_at = NOW() WHERE id = $1`,
              [approval.id]
            );
            remindersSent++;
          }
        } catch (err) {
          console.error(`Failed to send reminder for approval ${approval.id}:`, err);
        }
      }

      console.log(`✅ Report approval reminders: ${remindersSent} sent`);
    } catch (error) {
      console.error('❌ Error running report approval reminder jobs:', error);
    }
  });

  console.log('✅ Notification jobs started');
}
