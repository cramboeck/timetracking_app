import { pool } from '../config/database';

async function viewDatabase() {
  console.log('\n📊 TimeTracking Database Viewer\n');
  console.log('='.repeat(80));

  try {
    // View all users
    console.log('\n👥 REGISTERED USERS:\n');
    const usersResult = await pool.query(`
      SELECT
        id,
        username,
        email,
        account_type,
        organization_name,
        team_id,
        team_role,
        mfa_enabled,
        time_rounding_interval,
        created_at,
        last_login
      FROM users
      ORDER BY created_at DESC
    `);
    const users = usersResult.rows;

    if (users.length === 0) {
      console.log('   No users registered yet.');
    } else {
      users.forEach((user: any, index: number) => {
        console.log(`${index + 1}. ${user.username} (${user.email})`);
        console.log(`   ID: ${user.id}`);
        console.log(`   Account Type: ${user.account_type}`);
        if (user.organization_name) {
          console.log(`   Organization: ${user.organization_name}`);
        }
        if (user.team_id) {
          console.log(`   Team ID: ${user.team_id} (Role: ${user.team_role})`);
        }
        console.log(`   Time Rounding: ${user.time_rounding_interval} minutes`);
        console.log(`   MFA Enabled: ${user.mfa_enabled ? 'Yes' : 'No'}`);
        console.log(`   Created: ${new Date(user.created_at).toLocaleString('de-DE')}`);
        console.log(`   Last Login: ${user.last_login ? new Date(user.last_login).toLocaleString('de-DE') : 'Never'}`);
        console.log('');
      });
    }

    // View time entries count per user
    console.log('\n⏱️  TIME ENTRIES BY USER:\n');
    const entryCountsResult = await pool.query(`
      SELECT
        u.username,
        u.email,
        COUNT(te.id) as entry_count,
        SUM(te.duration) as total_seconds
      FROM users u
      LEFT JOIN time_entries te ON u.id = te.user_id
      GROUP BY u.id, u.username, u.email
      ORDER BY entry_count DESC
    `);
    const entryCounts = entryCountsResult.rows;

    entryCounts.forEach((row: any) => {
      const hours = row.total_seconds ? (parseInt(row.total_seconds) / 3600).toFixed(2) : '0.00';
      console.log(`   ${row.username}: ${row.entry_count} entries (${hours} hours)`);
    });

    // View teams
    console.log('\n👨‍👩‍👧‍👦 TEAMS:\n');
    const teamsResult = await pool.query(`
      SELECT
        id,
        name,
        owner_id,
        created_at
      FROM teams
    `);
    const teams = teamsResult.rows;

    if (teams.length === 0) {
      console.log('   No teams created yet.');
    } else {
      for (const team of teams) {
        const ownerResult = await pool.query('SELECT username FROM users WHERE id = $1', [team.owner_id]);
        const owner = ownerResult.rows[0];
        const memberCountResult = await pool.query('SELECT COUNT(*) as count FROM users WHERE team_id = $1', [team.id]);
        const memberCount = memberCountResult.rows[0];
        console.log(`   ${team.name}`);
        console.log(`   ID: ${team.id}`);
        console.log(`   Owner: ${owner?.username || 'Unknown'}`);
        console.log(`   Members: ${memberCount.count}`);
        console.log(`   Created: ${new Date(team.created_at).toLocaleString('de-DE')}`);
        console.log('');
      }
    }

    // View recent audit logs
    console.log('\n📋 RECENT AUDIT LOGS (Last 10):\n');
    const auditLogsResult = await pool.query(`
      SELECT
        al.action,
        al.details,
        al.ip_address,
        al.timestamp,
        u.username
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      ORDER BY al.timestamp DESC
      LIMIT 10
    `);
    const auditLogs = auditLogsResult.rows;

    if (auditLogs.length === 0) {
      console.log('   No audit logs yet.');
    } else {
      auditLogs.forEach((log: any) => {
        console.log(`   [${new Date(log.timestamp).toLocaleString('de-DE')}] ${log.username || 'Unknown'}`);
        console.log(`   Action: ${log.action} | Details: ${log.details || 'N/A'}`);
        console.log(`   IP: ${log.ip_address || 'N/A'}`);
        console.log('');
      });
    }

    console.log('='.repeat(80));
    console.log('\n✅ Database view complete!\n');

  } catch (error) {
    console.error('❌ Error viewing database:', error);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

viewDatabase();
