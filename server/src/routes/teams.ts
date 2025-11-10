import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../config/database';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { transformRow, transformRows } from '../utils/dbTransform';

const router = Router();

// Validation schemas
const createTeamSchema = z.object({
  name: z.string().min(1)
});

const invitationSchema = z.object({
  role: z.enum(['admin', 'member']),
  expiresInHours: z.number().min(1).max(168).default(168) // Default 7 days, max 7 days
});

// GET current user's team
router.get('/my-team', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    // Get user's team_id
    const userResult = await pool.query(
      'SELECT team_id FROM users WHERE id = $1',
      [userId]
    );

    if (!userResult.rows[0]?.team_id) {
      return res.json(null);
    }

    const teamId = userResult.rows[0].team_id;

    // Get team details
    const teamResult = await pool.query(
      'SELECT * FROM teams WHERE id = $1',
      [teamId]
    );

    if (teamResult.rows.length === 0) {
      return res.json(null);
    }

    const team = transformRow(teamResult.rows[0]);

    // Get team members
    const membersResult = await pool.query(
      `SELECT id, username, email, team_role as role
       FROM users
       WHERE team_id = $1
       ORDER BY team_role, username`,
      [teamId]
    );

    const members = transformRows(membersResult.rows);

    res.json({
      ...team,
      members
    });
  } catch (error) {
    console.error('Error fetching team:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST create new team
router.post('/', authenticateToken, validate(createTeamSchema), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { name } = req.body;

    // Check if user already has a team
    const userCheck = await pool.query(
      'SELECT team_id FROM users WHERE id = $1',
      [userId]
    );

    if (userCheck.rows[0]?.team_id) {
      return res.status(400).json({ error: 'User already belongs to a team' });
    }

    const teamId = crypto.randomUUID();

    // Create team
    await pool.query(
      'INSERT INTO teams (id, name, owner_id) VALUES ($1, $2, $3)',
      [teamId, name, userId]
    );

    // Update user's team_id and set as owner
    await pool.query(
      'UPDATE users SET team_id = $1, team_role = $2 WHERE id = $3',
      [teamId, 'owner', userId]
    );

    // Fetch the created team
    const result = await pool.query('SELECT * FROM teams WHERE id = $1', [teamId]);
    const team = transformRow(result.rows[0]);

    res.json(team);
  } catch (error) {
    console.error('Error creating team:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT update team name
router.put('/:teamId', authenticateToken, validate(createTeamSchema), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { teamId } = req.params;
    const { name } = req.body;

    // Check if user is owner or admin of the team
    const userResult = await pool.query(
      'SELECT team_id, team_role FROM users WHERE id = $1',
      [userId]
    );

    const user = userResult.rows[0];
    if (user.team_id !== teamId || !['owner', 'admin'].includes(user.team_role)) {
      return res.status(403).json({ error: 'Not authorized to update team' });
    }

    const result = await pool.query(
      'UPDATE teams SET name = $1 WHERE id = $2 RETURNING *',
      [name, teamId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const team = transformRow(result.rows[0]);
    res.json(team);
  } catch (error) {
    console.error('Error updating team:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE leave team
router.delete('/leave', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    // Get user's team info
    const userResult = await pool.query(
      'SELECT team_id, team_role FROM users WHERE id = $1',
      [userId]
    );

    const user = userResult.rows[0];
    if (!user.team_id) {
      return res.status(400).json({ error: 'User is not in a team' });
    }

    // Check if user is owner
    if (user.team_role === 'owner') {
      // Count other team members
      const countResult = await pool.query(
        'SELECT COUNT(*) as count FROM users WHERE team_id = $1 AND id != $2',
        [user.team_id, userId]
      );

      if (parseInt(countResult.rows[0].count) > 0) {
        return res.status(400).json({
          error: 'Team owner cannot leave while team has other members. Transfer ownership or delete the team first.'
        });
      }

      // Delete team if owner is the last member
      await pool.query('DELETE FROM teams WHERE id = $1', [user.team_id]);
    }

    // Remove user from team
    await pool.query(
      'UPDATE users SET team_id = NULL, team_role = NULL WHERE id = $1',
      [userId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error leaving team:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST create team invitation
router.post('/:teamId/invitations', authenticateToken, validate(invitationSchema), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { teamId } = req.params;
    const { role, expiresInHours } = req.body;

    // Check if user is owner or admin of the team
    const userResult = await pool.query(
      'SELECT team_id, team_role FROM users WHERE id = $1',
      [userId]
    );

    const user = userResult.rows[0];
    if (user.team_id !== teamId || !['owner', 'admin'].includes(user.team_role)) {
      return res.status(403).json({ error: 'Not authorized to create invitations' });
    }

    const id = crypto.randomUUID();
    const invitationCode = crypto.randomUUID().replace(/-/g, '').substring(0, 16).toUpperCase();
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

    const result = await pool.query(
      `INSERT INTO team_invitations
       (id, team_id, invitation_code, role, created_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [id, teamId, invitationCode, role, userId, expiresAt]
    );

    const invitation = transformRow(result.rows[0]);
    res.json(invitation);
  } catch (error) {
    console.error('Error creating invitation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET team invitations
router.get('/:teamId/invitations', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { teamId } = req.params;

    // Check if user is member of the team
    const userResult = await pool.query(
      'SELECT team_id FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows[0]?.team_id !== teamId) {
      return res.status(403).json({ error: 'Not authorized to view invitations' });
    }

    const result = await pool.query(
      `SELECT ti.*, u.username as created_by_username
       FROM team_invitations ti
       LEFT JOIN users u ON ti.created_by = u.id
       WHERE ti.team_id = $1 AND ti.used_by IS NULL
       ORDER BY ti.created_at DESC`,
      [teamId]
    );

    const invitations = transformRows(result.rows);
    res.json(invitations);
  } catch (error) {
    console.error('Error fetching invitations:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE team invitation
router.delete('/invitations/:invitationId', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { invitationId } = req.params;

    // Get invitation details
    const invitationResult = await pool.query(
      'SELECT team_id FROM team_invitations WHERE id = $1',
      [invitationId]
    );

    if (invitationResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invitation not found' });
    }

    const teamId = invitationResult.rows[0].team_id;

    // Check if user is owner or admin of the team
    const userResult = await pool.query(
      'SELECT team_id, team_role FROM users WHERE id = $1',
      [userId]
    );

    const user = userResult.rows[0];
    if (user.team_id !== teamId || !['owner', 'admin'].includes(user.team_role)) {
      return res.status(403).json({ error: 'Not authorized to delete invitations' });
    }

    await pool.query('DELETE FROM team_invitations WHERE id = $1', [invitationId]);

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting invitation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST join team with invitation code
router.post('/join/:invitationCode', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { invitationCode } = req.params;

    // Check if user already has a team
    const userCheck = await pool.query(
      'SELECT team_id FROM users WHERE id = $1',
      [userId]
    );

    if (userCheck.rows[0]?.team_id) {
      return res.status(400).json({ error: 'User already belongs to a team' });
    }

    // Get invitation
    const invitationResult = await pool.query(
      `SELECT * FROM team_invitations
       WHERE invitation_code = $1 AND used_by IS NULL AND expires_at > NOW()`,
      [invitationCode]
    );

    if (invitationResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid or expired invitation code' });
    }

    const invitation = invitationResult.rows[0];

    // Update user's team
    await pool.query(
      'UPDATE users SET team_id = $1, team_role = $2 WHERE id = $3',
      [invitation.team_id, invitation.role, userId]
    );

    // Mark invitation as used
    await pool.query(
      'UPDATE team_invitations SET used_by = $1, used_at = NOW() WHERE id = $2',
      [userId, invitation.id]
    );

    // Get team details
    const teamResult = await pool.query('SELECT * FROM teams WHERE id = $1', [invitation.team_id]);
    const team = transformRow(teamResult.rows[0]);

    res.json(team);
  } catch (error) {
    console.error('Error joining team:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
