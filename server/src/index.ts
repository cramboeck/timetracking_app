import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import { initializeDatabase } from './config/database';
import { startNotificationJobs } from './jobs/notificationJobs';
import authRoutes from './routes/auth';
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

// Initialize database
initializeDatabase();

// Routes
app.use('/api/auth', authRoutes);

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
║   🚀 TimeTrack Backend Server Started    ║
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
