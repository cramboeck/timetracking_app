import { initializeDatabase, pool } from '../config/database';

async function runMigrations() {
  console.log('🚀 Starting database migrations...');

  try {
    await initializeDatabase();
    console.log('✅ All migrations completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations();
