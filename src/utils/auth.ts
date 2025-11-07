/**
 * Authentication utilities
 *
 * IMPORTANT: This is a client-side implementation for development.
 * In production, password hashing MUST be done server-side with bcrypt/argon2.
 * Never trust client-side password hashing for real security!
 */

/**
 * Simple hash function for client-side storage
 * TODO: Replace with proper backend authentication
 */
export const hashPassword = async (password: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

/**
 * Verify password against hash
 */
export const verifyPassword = async (password: string, hash: string): Promise<boolean> => {
  const passwordHash = await hashPassword(password);
  return passwordHash === hash;
};

/**
 * Validate password strength
 */
export const validatePassword = (password: string): { valid: boolean; message?: string } => {
  if (password.length < 8) {
    return { valid: false, message: 'Passwort muss mindestens 8 Zeichen lang sein' };
  }

  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: 'Passwort muss mindestens einen Großbuchstaben enthalten' };
  }

  if (!/[a-z]/.test(password)) {
    return { valid: false, message: 'Passwort muss mindestens einen Kleinbuchstaben enthalten' };
  }

  if (!/[0-9]/.test(password)) {
    return { valid: false, message: 'Passwort muss mindestens eine Zahl enthalten' };
  }

  return { valid: true };
};

/**
 * Validate email format
 */
export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validate username
 */
export const validateUsername = (username: string): { valid: boolean; message?: string } => {
  if (username.length < 3) {
    return { valid: false, message: 'Benutzername muss mindestens 3 Zeichen lang sein' };
  }

  if (username.length > 20) {
    return { valid: false, message: 'Benutzername darf maximal 20 Zeichen lang sein' };
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    return { valid: false, message: 'Benutzername darf nur Buchstaben, Zahlen, _ und - enthalten' };
  }

  return { valid: true };
};
