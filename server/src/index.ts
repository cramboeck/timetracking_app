import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import { initializeDatabase } from './config/database';
import { startNotificationJobs } from './jobs/notificationJobs';
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
import { apiLimiter } from './middleware/rateLimiter';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

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

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    emailTestMode: process.env.EMAIL_TEST_MODE === 'true'
  });
});

// Start notification jobs
startNotificationJobs();

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
