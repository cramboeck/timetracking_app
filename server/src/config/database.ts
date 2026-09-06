import { Pool, PoolClient, QueryResult } from 'pg';
import dotenv from 'dotenv';
import { logger } from '../utils/logger';
import { MIGRATIONS } from './migrations';

// Load environment variables
dotenv.config();

// Create PostgreSQL connection pool
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set');
}

export const pool = new Pool({
  connectionString,
  // Disable SSL for Docker internal connections (database hostname)
  // Enable SSL only for external database connections (e.g., managed databases)
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// Test database connection
pool.on('connect', () => {
  logger.info('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  logger.error('❌ Unexpected error on idle client', err);
  process.exit(-1);
});

// Helper function to run queries
export async function query(text: string, params?: any[]): Promise<QueryResult> {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    logger.debug('Executed query', { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    logger.error('Query error', { text, error });
    throw error;
  }
}

// Helper function to get a client from the pool
export async function getClient(): Promise<PoolClient> {
  return await pool.connect();
}


// Initialize database schema.
// Die eigentlichen Migrationen leben in ./migrations/ als nummerierte Dateien
// (Split 6.9.2026, vorher 5700 Zeilen Monolith). Alles laeuft weiterhin in
// EINER Transaktion; neue Migrationen kommen als neue Datei ans Ende der
// MIGRATIONS-Liste.
export async function initializeDatabase() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    for (const migration of MIGRATIONS) {
      await migration.run(client);
    }

    await client.query('COMMIT');
    logger.info('✅ Database schema initialized successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('❌ Error initializing database:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  pool.end(() => {
    logger.info('Database pool has ended');
  });
});

