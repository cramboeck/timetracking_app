import { pool } from '../config/database';
import bcrypt from 'bcryptjs';
import * as readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer);
    });
  });
}

async function createAdmin() {
  console.log('\n🔐 Admin User Setup\n');
  console.log('Choose an option:');
  console.log('1. Make existing user an admin');
  console.log('2. Create new admin user\n');

  const choice = await question('Your choice (1 or 2): ');

  if (choice === '1') {
    await makeExistingUserAdmin();
  } else if (choice === '2') {
    await createNewAdminUser();
  } else {
    console.log('❌ Invalid choice');
  }

  rl.close();
  await pool.end();
}

async function makeExistingUserAdmin() {
  const email = await question('\nEnter user email: ');

  try {
    // Check if user exists
    const result = await pool.query(
      'SELECT id, username, email, role FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      console.log(`❌ User with email "${email}" not found`);
      return;
    }

    const user = result.rows[0];

    if (user.role === 'admin') {
      console.log(`✅ User "${user.username}" is already an admin`);
      return;
    }

    // Update to admin
    await pool.query('UPDATE users SET role = $1 WHERE id = $2', ['admin', user.id]);

    console.log(`\n✅ Success! User "${user.username}" is now an admin`);
    console.log(`   Email: ${user.email}`);
    console.log(`   User ID: ${user.id}`);
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

async function createNewAdminUser() {
  console.log('\n📝 Create new admin user\n');

  const username = await question('Username: ');
  const email = await question('Email: ');
  const password = await question('Password (min 8 chars): ');

  // Validate
  if (username.length < 3) {
    console.log('❌ Username must be at least 3 characters');
    return;
  }

  if (!email.includes('@')) {
    console.log('❌ Invalid email address');
    return;
  }

  if (password.length < 8) {
    console.log('❌ Password must be at least 8 characters');
    return;
  }

  try {
    // Check if username exists
    const usernameCheck = await pool.query(
      'SELECT id FROM users WHERE username = $1',
      [username]
    );

    if (usernameCheck.rows.length > 0) {
      console.log('❌ Username already exists');
      return;
    }

    // Check if email exists
    const emailCheck = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (emailCheck.rows.length > 0) {
      console.log('❌ Email already exists');
      return;
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const userId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO users (
        id, username, email, password_hash, account_type,
        role, mfa_enabled, accent_color, gray_tone,
        time_rounding_interval, created_at, last_login
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        userId,
        username,
        email,
        passwordHash,
        'business', // Default account type for admin
        'admin',    // Admin role
        false,      // MFA disabled
        'blue',
        'medium',
        15,
        new Date().toISOString(),
        new Date().toISOString()
      ]
    );

    console.log('\n✅ Admin user created successfully!');
    console.log(`   Username: ${username}`);
    console.log(`   Email: ${email}`);
    console.log(`   User ID: ${userId}`);
    console.log(`   Role: admin`);
    console.log('\n🔑 You can now login with these credentials');
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Run the script
createAdmin();
