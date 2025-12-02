import { Request, Response, NextFunction } from 'express';
import { query } from '../config/database';

// Extended request interface with organization info
export interface OrganizationRequest extends Request {
  user: {
    id: string;
    username: string;
    email: string;
    role: string;
    [key: string]: any;
  };
  organization: {
    id: string;
    name: string;
    slug: string;
    role: 'owner' | 'admin' | 'member' | 'viewer';
  };
}

/**
 * Middleware to attach the user's current organization to the request.
 * Must be used after authenticateToken middleware.
 *
 * The organization is determined by:
 * 1. X-Organization-Id header (if user is member of that org)
 * 2. Default: the user's primary organization (owner > first joined)
 */
export async function attachOrganization(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    // Check if specific organization is requested via header
    const requestedOrgId = req.headers['x-organization-id'] as string;

    let orgQuery: string;
    let orgParams: any[];

    if (requestedOrgId) {
      // Verify user is member of requested organization
      orgQuery = `
        SELECT o.id, o.name, o.slug, om.role
        FROM organizations o
        JOIN organization_members om ON o.id = om.organization_id
        WHERE om.user_id = $1 AND o.id = $2
      `;
      orgParams = [userId, requestedOrgId];
    } else {
      // Get user's primary organization (prefer owned, then first joined)
      orgQuery = `
        SELECT o.id, o.name, o.slug, om.role
        FROM organizations o
        JOIN organization_members om ON o.id = om.organization_id
        WHERE om.user_id = $1
        ORDER BY om.role = 'owner' DESC, om.joined_at ASC
        LIMIT 1
      `;
      orgParams = [userId];
    }

    const result = await query(orgQuery, orgParams);

    if (result.rows.length === 0) {
      // User has no organization - this shouldn't happen after migration
      // but handle gracefully
      return res.status(403).json({
        success: false,
        error: 'No organization found. Please contact support.'
      });
    }

    // Attach organization to request
    (req as OrganizationRequest).organization = {
      id: result.rows[0].id,
      name: result.rows[0].name,
      slug: result.rows[0].slug,
      role: result.rows[0].role,
    };

    next();
  } catch (error) {
    console.error('Error attaching organization:', error);
    res.status(500).json({ success: false, error: 'Failed to determine organization' });
  }
}

/**
 * Helper function to get user's organization ID directly (for use in routes without middleware)
 */
export async function getUserOrganizationId(userId: string): Promise<string | null> {
  const result = await query(`
    SELECT o.id
    FROM organizations o
    JOIN organization_members om ON o.id = om.organization_id
    WHERE om.user_id = $1
    ORDER BY om.role = 'owner' DESC, om.joined_at ASC
    LIMIT 1
  `, [userId]);

  return result.rows.length > 0 ? result.rows[0].id : null;
}

/**
 * Check if user has at least the specified role in their organization
 */
export function hasOrgRole(req: OrganizationRequest, minRole: 'viewer' | 'member' | 'admin' | 'owner'): boolean {
  const roleHierarchy = { viewer: 0, member: 1, admin: 2, owner: 3 };
  const userRoleLevel = roleHierarchy[req.organization.role] || 0;
  const requiredLevel = roleHierarchy[minRole] || 0;
  return userRoleLevel >= requiredLevel;
}

/**
 * Middleware to require minimum organization role
 */
export function requireOrgRole(minRole: 'viewer' | 'member' | 'admin' | 'owner') {
  return (req: Request, res: Response, next: NextFunction) => {
    const orgReq = req as OrganizationRequest;

    if (!orgReq.organization) {
      return res.status(403).json({ success: false, error: 'Organization context required' });
    }

    if (!hasOrgRole(orgReq, minRole)) {
      return res.status(403).json({
        success: false,
        error: `Requires at least ${minRole} role in organization`
      });
    }

    next();
  };
}
