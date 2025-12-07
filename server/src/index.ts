import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import path from 'path';
import fs from 'fs';
import { initializeDatabase } from './config/database';
import { startNotificationJobs } from './jobs/notificationJobs';
import { startNinjaJobs } from './jobs/ninjaJobs';
import authRoutes from './routes/auth';
import entriesRoutes from './routes/entries';
import projectsRoutes from './routes/projects';
import customersRoutes from './routes/customers';
import activitiesRoutes from './routes/activities';
import userRoutes from './routes/user';
import adminRoutes from './routes/admin';
import passwordResetRoutes from './routes/password-reset';
import companyInfoRoutes from './routes/company-info';
import teamsRoutes from './routes/teams';
import reportApprovalsRoutes from './routes/report-approvals';
import ticketsRoutes from './routes/tickets';
import customerPortalRoutes from './routes/customer-portal';
import knowledgeBaseRoutes from './routes/knowledge-base';
import pushRoutes from './routes/push';
import sevdeskRoutes from './routes/sevdesk';
import ninjarmmRoutes from './routes/ninjarmm';
import featuresRoutes from './routes/features';
import maintenanceRoutes from './routes/maintenance';
import mfaRoutes from './routes/mfa';
import organizationsRoutes from './routes/organizations';
import leadsRoutes from './routes/leads';
import tasksRoutes from './routes/tasks';
import { apiLimiter } from './middleware/rateLimiter';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Trust proxy - required when behind nginx reverse proxy
// This enables correct IP detection for rate limiting
app.set('trust proxy', 1);

// Security Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
app.use('/api/', apiLimiter);

// Initialize database (async for PostgreSQL)
initializeDatabase().catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/entries', entriesRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api/customers', customersRoutes);
app.use('/api/activities', activitiesRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/password-reset', passwordResetRoutes);
app.use('/api/company-info', companyInfoRoutes);
app.use('/api/teams', teamsRoutes);
app.use('/api/report-approvals', reportApprovalsRoutes);
app.use('/api/tickets', ticketsRoutes);
app.use('/api/customer-portal', customerPortalRoutes);
app.use('/api/knowledge-base', knowledgeBaseRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/sevdesk', sevdeskRoutes);
app.use('/api/ninjarmm', ninjarmmRoutes);
app.use('/api/features', featuresRoutes);
app.use('/api/maintenance', maintenanceRoutes);
app.use('/api/mfa', mfaRoutes);
app.use('/api/organizations', organizationsRoutes);
app.use('/api/leads', leadsRoutes);
app.use('/api/tasks', tasksRoutes);

// Static file serving for uploads
const uploadsDir = process.env.UPLOADS_DIR || '/app/uploads';
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/api/uploads', express.static(uploadsDir));

// Health check - Basic liveness probe (is the server running?)
// Available at both /health (direct) and /api/health (via nginx)
const healthHandler = (req: any, res: any) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    environment: process.env.NODE_ENV || 'development',
  });
};
app.get('/health', healthHandler);
app.get('/api/health', healthHandler);

// Ready check - Full readiness probe (is the server ready to accept requests?)
// Available at both /ready (direct) and /api/ready (via nginx)
const readyHandler = async (req: any, res: any) => {
  const checks: Record<string, { status: string; latency?: number; error?: string }> = {};
  let allHealthy = true;

  // Check database connection
  try {
    const dbStart = Date.now();
    const { pool } = await import('./config/database');
    await pool.query('SELECT 1');
    checks.database = { status: 'ok', latency: Date.now() - dbStart };
  } catch (error: any) {
    checks.database = { status: 'error', error: error.message };
    allHealthy = false;
  }

  // Check disk space for uploads (basic check)
  try {
    const uploadsDir = process.env.UPLOADS_DIR || '/app/uploads';
    fs.accessSync(uploadsDir, fs.constants.W_OK);
    checks.uploads = { status: 'ok' };
  } catch (error: any) {
    checks.uploads = { status: 'error', error: 'Uploads directory not writable' };
    allHealthy = false;
  }

  // Memory usage
  const memUsage = process.memoryUsage();
  checks.memory = {
    status: 'ok',
    latency: Math.round(memUsage.heapUsed / 1024 / 1024), // MB used
  };

  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? 'ready' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    version: process.env.npm_package_version || '1.0.0',
    checks,
  });
};
app.get('/ready', readyHandler);
app.get('/api/ready', readyHandler);

// Start notification jobs
startNotificationJobs();

// Start NinjaRMM auto-sync jobs
startNinjaJobs();

// Start server
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════╗
║   🚀 RamboFlow Backend Server Started    ║
║                                          ║
║   Port: ${PORT}                             ║
║   Environment: ${process.env.NODE_ENV || 'development'.padEnd(23)}║
║   Email Test Mode: ${(process.env.EMAIL_TEST_MODE === 'true' ? 'Enabled' : 'Disabled').padEnd(17)}║
║                                          ║
║   Health Check: http://localhost:${PORT}/health ║
╚══════════════════════════════════════════╝
  `);
});

export default app;
