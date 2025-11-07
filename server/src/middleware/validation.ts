import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema } from 'zod';

// Validation middleware factory
export const validate = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Validation failed',
          details: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message
          }))
        });
      }
      next(error);
    }
  };
};

// Validation schemas
export const registerSchema = z.object({
  username: z.string()
    .min(3, 'Username must be at least 3 characters')
    .max(20, 'Username must be at most 20 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores and hyphens'),
  email: z.string()
    .email('Invalid email address'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  accountType: z.enum(['personal', 'business', 'team']),
  organizationName: z.string().optional(),
  inviteCode: z.string().optional()
});

export const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
  mfaCode: z.string().optional()
});

export const timeEntrySchema = z.object({
  projectId: z.string().uuid('Invalid project ID'),
  startTime: z.string().datetime('Invalid start time'),
  endTime: z.string().datetime('Invalid end time').optional(),
  duration: z.number().min(0, 'Duration must be positive'),
  description: z.string().optional(),
  isRunning: z.boolean().optional()
});

export const customerSchema = z.object({
  name: z.string().min(1, 'Customer name is required').max(100),
  color: z.string().regex(/^#[0-9A-F]{6}$/i, 'Invalid color format'),
  customerNumber: z.string().max(50).optional(),
  contactPerson: z.string().max(100).optional(),
  email: z.string().email('Invalid email').optional(),
  address: z.string().max(500).optional(),
  reportTitle: z.string().max(200).optional()
});

export const projectSchema = z.object({
  customerId: z.string().uuid('Invalid customer ID'),
  name: z.string().min(1, 'Project name is required').max(100),
  isActive: z.boolean().optional(),
  rateType: z.enum(['hourly', 'daily']),
  hourlyRate: z.number().min(0, 'Rate must be positive').optional()
});

export const activitySchema = z.object({
  name: z.string().min(1, 'Activity name is required').max(100),
  description: z.string().max(500).optional(),
  isBillable: z.boolean(),
  pricingType: z.enum(['hourly', 'flat']),
  flatRate: z.number().min(0, 'Flat rate must be positive').optional()
});
