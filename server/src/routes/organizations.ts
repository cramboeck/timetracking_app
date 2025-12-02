import express from 'express';
import crypto from 'crypto';
import { query } from '../config/database';
import { authenticateToken } from '../middleware/auth';
import { auditLog } from '../services/auditLog';

const router = express.Router();

// Helper function to generate a slug from a name
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// Helper function to check if user is organization admin/owner
async function isOrgAdmin(userId: string, organizationId: string): Promise<boolean> {
  const result = await query(
    `SELECT role FROM organization_members WHERE user_id = $1 AND organization_id = $2`,
    [userId, organizationId]
  );
  return result.rows.length > 0 && ['owner', 'admin'].includes(result.rows[0].role);
}

// Helper function to check if user is organization owner
async function isOrgOwner(userId: string, organizationId: string): Promise<boolean> {
  const result = await query(
    `SELECT role FROM organization_members WHERE user_id = $1 AND organization_id = $2`,
    [userId, organizationId]
  );
  return result.rows.length > 0 && result.rows[0].role === 'owner';
}

// GET /api/organizations - Get user's organizations
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user.id;

    const result = await query(`
      SELECT o.*, om.role as user_role,
             (SELECT COUNT(*) FROM organization_members WHERE organization_id = o.id) as member_count
      FROM organizations o
      JOIN organization_members om ON o.id = om.organization_id
      WHERE om.user_id = $1
      ORDER BY o.name ASC
    `, [userId]);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching organizations:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch organizations' });
  }
});

// GET /api/organizations/current - Get current/active organization
router.get('/current', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user.id;

    // Get the user's primary organization (the one they own or first joined)
    const result = await query(`
      SELECT o.*, om.role as user_role,
             (SELECT COUNT(*) FROM organization_members WHERE organization_id = o.id) as member_count
      FROM organizations o
      JOIN organization_members om ON o.id = om.organization_id
      WHERE om.user_id = $1
      ORDER BY om.role = 'owner' DESC, om.joined_at ASC
      LIMIT 1
    `, [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'No organization found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error fetching current organization:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch current organization' });
  }
});

// GET /api/organizations/:id - Get organization details
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;

    // Verify user is member of organization
    const memberCheck = await query(
      `SELECT role FROM organization_members WHERE user_id = $1 AND organization_id = $2`,
      [userId, id]
    );

    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ success: false, error: 'Not a member of this organization' });
    }

    const result = await query(`
      SELECT o.*,
             (SELECT COUNT(*) FROM organization_members WHERE organization_id = o.id) as member_count,
             (SELECT COUNT(*) FROM customers WHERE organization_id = o.id) as customer_count,
             (SELECT COUNT(*) FROM projects WHERE organization_id = o.id) as project_count,
             (SELECT COUNT(*) FROM tickets WHERE organization_id = o.id) as ticket_count
      FROM organizations o
      WHERE o.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Organization not found' });
    }

    res.json({
      success: true,
      data: {
        ...result.rows[0],
        userRole: memberCheck.rows[0].role
      }
    });
  } catch (error) {
    console.error('Error fetching organization:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch organization' });
  }
});

// POST /api/organizations - Create new organization
router.post('/', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { name, settings } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ success: false, error: 'Organization name is required' });
    }

    const id = crypto.randomUUID();
    let slug = generateSlug(name);

    // Ensure slug is unique
    const slugCheck = await query('SELECT id FROM organizations WHERE slug = $1', [slug]);
    if (slugCheck.rows.length > 0) {
      slug = `${slug}-${crypto.randomBytes(3).toString('hex')}`;
    }

    // Create organization
    const result = await query(`
      INSERT INTO organizations (id, name, slug, owner_user_id, settings)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [id, name.trim(), slug, userId, settings ? JSON.stringify(settings) : '{}']);

    // Add creator as owner
    await query(`
      INSERT INTO organization_members (id, organization_id, user_id, role)
      VALUES ($1, $2, $3, 'owner')
    `, [crypto.randomUUID(), id, userId]);

    // Audit log
    await auditLog.log({
      userId,
      action: 'organization.create',
      details: JSON.stringify({ organizationId: id, name: name.trim() }),
    });

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error creating organization:', error);
    res.status(500).json({ success: false, error: 'Failed to create organization' });
  }
});

// PUT /api/organizations/:id - Update organization
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;
    const { name, settings, logo } = req.body;

    // Check if user is admin/owner
    if (!await isOrgAdmin(userId, id)) {
      return res.status(403).json({ success: false, error: 'Not authorized to update this organization' });
    }

    const result = await query(`
      UPDATE organizations SET
        name = COALESCE($1, name),
        settings = COALESCE($2, settings),
        logo = COALESCE($3, logo),
        updated_at = NOW()
      WHERE id = $4
      RETURNING *
    `, [name?.trim(), settings ? JSON.stringify(settings) : null, logo, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Organization not found' });
    }

    // Audit log
    await auditLog.log({
      userId,
      action: 'organization.update',
      details: JSON.stringify({ organizationId: id, updatedFields: { name, settings, logo } }),
    });

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error updating organization:', error);
    res.status(500).json({ success: false, error: 'Failed to update organization' });
  }
});

// ============================================
// Organization Members
// ============================================

// GET /api/organizations/:id/members - Get organization members
router.get('/:id/members', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;

    // Verify user is member
    const memberCheck = await query(
      `SELECT role FROM organization_members WHERE user_id = $1 AND organization_id = $2`,
      [userId, id]
    );

    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ success: false, error: 'Not a member of this organization' });
    }

    const result = await query(`
      SELECT om.*, u.username, u.email, u.display_name, u.last_login
      FROM organization_members om
      JOIN users u ON om.user_id = u.id
      WHERE om.organization_id = $1
      ORDER BY om.role = 'owner' DESC, om.joined_at ASC
    `, [id]);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching members:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch members' });
  }
});

// PUT /api/organizations/:id/members/:memberId - Update member role
router.put('/:id/members/:memberId', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { id, memberId } = req.params;
    const { role } = req.body;

    if (!['admin', 'member', 'viewer'].includes(role)) {
      return res.status(400).json({ success: false, error: 'Invalid role' });
    }

    // Check if user is admin/owner
    if (!await isOrgAdmin(userId, id)) {
      return res.status(403).json({ success: false, error: 'Not authorized to change member roles' });
    }

    // Prevent changing owner's role
    const targetMember = await query(
      `SELECT role FROM organization_members WHERE id = $1`,
      [memberId]
    );

    if (targetMember.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Member not found' });
    }

    if (targetMember.rows[0].role === 'owner') {
      return res.status(400).json({ success: false, error: 'Cannot change owner role' });
    }

    const result = await query(`
      UPDATE organization_members SET role = $1
      WHERE id = $2 AND organization_id = $3
      RETURNING *
    `, [role, memberId, id]);

    // Audit log
    await auditLog.log({
      userId,
      action: 'organization.member_role_change',
      details: JSON.stringify({ organizationId: id, memberId, newRole: role }),
    });

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error updating member role:', error);
    res.status(500).json({ success: false, error: 'Failed to update member role' });
  }
});

// DELETE /api/organizations/:id/members/:memberId - Remove member
router.delete('/:id/members/:memberId', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { id, memberId } = req.params;

    // Check if user is admin/owner
    if (!await isOrgAdmin(userId, id)) {
      return res.status(403).json({ success: false, error: 'Not authorized to remove members' });
    }

    // Get member info before deleting
    const memberInfo = await query(`
      SELECT om.*, u.username FROM organization_members om
      JOIN users u ON om.user_id = u.id
      WHERE om.id = $1
    `, [memberId]);

    if (memberInfo.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Member not found' });
    }

    // Prevent removing owner
    if (memberInfo.rows[0].role === 'owner') {
      return res.status(400).json({ success: false, error: 'Cannot remove organization owner' });
    }

    await query('DELETE FROM organization_members WHERE id = $1', [memberId]);

    // Audit log
    await auditLog.log({
      userId,
      action: 'organization.member_remove',
      details: JSON.stringify({
        organizationId: id,
        removedUserId: memberInfo.rows[0].user_id,
        removedUsername: memberInfo.rows[0].username
      }),
    });

    res.json({ success: true, message: 'Member removed' });
  } catch (error) {
    console.error('Error removing member:', error);
    res.status(500).json({ success: false, error: 'Failed to remove member' });
  }
});

// ============================================
// Organization Invitations
// ============================================

// GET /api/organizations/:id/invitations - Get pending invitations
router.get('/:id/invitations', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;

    // Check if user is admin/owner
    if (!await isOrgAdmin(userId, id)) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    const result = await query(`
      SELECT oi.*, u.username as invited_by_name
      FROM organization_invitations oi
      JOIN users u ON oi.invited_by = u.id
      WHERE oi.organization_id = $1 AND oi.accepted_at IS NULL AND oi.expires_at > NOW()
      ORDER BY oi.created_at DESC
    `, [id]);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching invitations:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch invitations' });
  }
});

// POST /api/organizations/:id/invitations - Create invitation
router.post('/:id/invitations', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;
    const { email, role = 'member' } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }

    if (!['admin', 'member', 'viewer'].includes(role)) {
      return res.status(400).json({ success: false, error: 'Invalid role' });
    }

    // Check if user is admin/owner
    if (!await isOrgAdmin(userId, id)) {
      return res.status(403).json({ success: false, error: 'Not authorized to invite members' });
    }

    // Check if email is already a member
    const existingMember = await query(`
      SELECT 1 FROM organization_members om
      JOIN users u ON om.user_id = u.id
      WHERE om.organization_id = $1 AND u.email = $2
    `, [id, email]);

    if (existingMember.rows.length > 0) {
      return res.status(400).json({ success: false, error: 'User is already a member' });
    }

    // Check for existing pending invitation
    const existingInvite = await query(`
      SELECT id FROM organization_invitations
      WHERE organization_id = $1 AND email = $2 AND accepted_at IS NULL AND expires_at > NOW()
    `, [id, email]);

    if (existingInvite.rows.length > 0) {
      return res.status(400).json({ success: false, error: 'Pending invitation already exists for this email' });
    }

    const invitationId = crypto.randomUUID();
    const invitationCode = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const result = await query(`
      INSERT INTO organization_invitations (id, organization_id, email, role, invitation_code, invited_by, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [invitationId, id, email, role, invitationCode, userId, expiresAt]);

    // Audit log
    await auditLog.log({
      userId,
      action: 'organization.invitation_create',
      details: JSON.stringify({ organizationId: id, email, role }),
    });

    // TODO: Send invitation email

    res.status(201).json({
      success: true,
      data: result.rows[0],
      invitationLink: `/join/${invitationCode}` // Frontend will construct full URL
    });
  } catch (error) {
    console.error('Error creating invitation:', error);
    res.status(500).json({ success: false, error: 'Failed to create invitation' });
  }
});

// DELETE /api/organizations/:id/invitations/:invitationId - Cancel invitation
router.delete('/:id/invitations/:invitationId', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { id, invitationId } = req.params;

    // Check if user is admin/owner
    if (!await isOrgAdmin(userId, id)) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    const result = await query(
      'DELETE FROM organization_invitations WHERE id = $1 AND organization_id = $2 RETURNING email',
      [invitationId, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Invitation not found' });
    }

    res.json({ success: true, message: 'Invitation cancelled' });
  } catch (error) {
    console.error('Error cancelling invitation:', error);
    res.status(500).json({ success: false, error: 'Failed to cancel invitation' });
  }
});

// POST /api/organizations/join/:code - Accept invitation
router.post('/join/:code', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { code } = req.params;

    // Find invitation
    const invitation = await query(`
      SELECT oi.*, o.name as organization_name
      FROM organization_invitations oi
      JOIN organizations o ON oi.organization_id = o.id
      WHERE oi.invitation_code = $1 AND oi.accepted_at IS NULL
    `, [code]);

    if (invitation.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Invitation not found or already used' });
    }

    const inv = invitation.rows[0];

    // Check if expired
    if (new Date(inv.expires_at) < new Date()) {
      return res.status(400).json({ success: false, error: 'Invitation has expired' });
    }

    // Check if user is already a member
    const existingMember = await query(
      `SELECT 1 FROM organization_members WHERE organization_id = $1 AND user_id = $2`,
      [inv.organization_id, userId]
    );

    if (existingMember.rows.length > 0) {
      return res.status(400).json({ success: false, error: 'You are already a member of this organization' });
    }

    // Add user as member
    await query(`
      INSERT INTO organization_members (id, organization_id, user_id, role, invited_by)
      VALUES ($1, $2, $3, $4, $5)
    `, [crypto.randomUUID(), inv.organization_id, userId, inv.role, inv.invited_by]);

    // Mark invitation as accepted
    await query(`
      UPDATE organization_invitations SET accepted_at = NOW(), accepted_by = $1
      WHERE id = $2
    `, [userId, inv.id]);

    // Audit log
    await auditLog.log({
      userId,
      action: 'organization.invitation_accept',
      details: JSON.stringify({ organizationId: inv.organization_id, organizationName: inv.organization_name }),
    });

    res.json({
      success: true,
      message: `Successfully joined ${inv.organization_name}`,
      organizationId: inv.organization_id
    });
  } catch (error) {
    console.error('Error accepting invitation:', error);
    res.status(500).json({ success: false, error: 'Failed to accept invitation' });
  }
});

// GET /api/organizations/invitation/:code - Get invitation info (for preview before login)
router.get('/invitation/:code', async (req, res) => {
  try {
    const { code } = req.params;

    const result = await query(`
      SELECT o.name as organization_name, o.logo, oi.role, oi.expires_at,
             u.display_name as invited_by_name
      FROM organization_invitations oi
      JOIN organizations o ON oi.organization_id = o.id
      JOIN users u ON oi.invited_by = u.id
      WHERE oi.invitation_code = $1 AND oi.accepted_at IS NULL
    `, [code]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Invitation not found or already used' });
    }

    const inv = result.rows[0];

    if (new Date(inv.expires_at) < new Date()) {
      return res.status(400).json({ success: false, error: 'Invitation has expired' });
    }

    res.json({
      success: true,
      data: {
        organizationName: inv.organization_name,
        logo: inv.logo,
        role: inv.role,
        invitedBy: inv.invited_by_name,
        expiresAt: inv.expires_at
      }
    });
  } catch (error) {
    console.error('Error fetching invitation:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch invitation' });
  }
});

// POST /api/organizations/:id/leave - Leave organization
router.post('/:id/leave', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;

    // Check if user is owner
    if (await isOrgOwner(userId, id)) {
      return res.status(400).json({
        success: false,
        error: 'Organization owner cannot leave. Transfer ownership first or delete the organization.'
      });
    }

    const result = await query(
      'DELETE FROM organization_members WHERE organization_id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Not a member of this organization' });
    }

    // Audit log
    await auditLog.log({
      userId,
      action: 'organization.leave',
      details: JSON.stringify({ organizationId: id }),
    });

    res.json({ success: true, message: 'Left organization' });
  } catch (error) {
    console.error('Error leaving organization:', error);
    res.status(500).json({ success: false, error: 'Failed to leave organization' });
  }
});

export default router;
