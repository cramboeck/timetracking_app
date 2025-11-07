import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, LoginCredentials, RegisterData, AccentColor, GrayTone, TimeRoundingInterval } from '../types';
import { storage } from '../utils/storage';
import { hashPassword, verifyPassword, validatePassword, validateEmail, validateUsername } from '../utils/auth';
import { accentColor } from '../utils/accentColor';
import { grayTone } from '../utils/theme';

interface AuthContextType {
  currentUser: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginCredentials) => Promise<{ success: boolean; message?: string }>;
  register: (data: RegisterData) => Promise<{ success: boolean; message?: string }>;
  logout: () => void;
  updateAccentColor: (color: AccentColor) => void;
  updateGrayTone: (tone: GrayTone) => void;
  updateTimeRoundingInterval: (interval: TimeRoundingInterval) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

// Helper function to apply accent color to root element
const applyAccentColorToRoot = (color: AccentColor) => {
  const root = document.documentElement;
  // Remove all accent color classes
  root.classList.remove('accent-blue', 'accent-green', 'accent-orange', 'accent-purple', 'accent-red', 'accent-pink');
  // Add selected color class
  root.classList.add(`accent-${color}`);
};

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load current user on mount
  useEffect(() => {
    const user = storage.getCurrentUser();
    setCurrentUser(user);

    // Initialize theme
    if (user) {
      accentColor.set(user.accentColor);
      grayTone.set(user.grayTone);
      applyAccentColorToRoot(user.accentColor);
    }

    setIsLoading(false);
  }, []);

  const login = async (credentials: LoginCredentials): Promise<{ success: boolean; message?: string }> => {
    try {
      const user = storage.getUserByUsername(credentials.username);

      if (!user) {
        return { success: false, message: 'Benutzername oder Passwort falsch' };
      }

      // Verify password
      const isValid = await verifyPassword(credentials.password, user.passwordHash);

      if (!isValid) {
        return { success: false, message: 'Benutzername oder Passwort falsch' };
      }

      // TODO: MFA verification here when implemented
      if (user.mfaEnabled && !credentials.mfaCode) {
        return { success: false, message: 'MFA-Code erforderlich' };
      }

      // Update last login
      const updatedUser = { ...user, lastLogin: new Date().toISOString() };
      storage.updateUser(user.id, { lastLogin: updatedUser.lastLogin });
      storage.setCurrentUser(updatedUser);
      setCurrentUser(updatedUser);

      // Apply user's theme
      accentColor.set(updatedUser.accentColor);
      grayTone.set(updatedUser.grayTone);
      applyAccentColorToRoot(updatedUser.accentColor);

      return { success: true };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, message: 'Ein Fehler ist aufgetreten' };
    }
  };

  const register = async (data: RegisterData): Promise<{ success: boolean; message?: string }> => {
    try {
      // Validate username
      const usernameValidation = validateUsername(data.username);
      if (!usernameValidation.valid) {
        return { success: false, message: usernameValidation.message };
      }

      // Validate email
      if (!validateEmail(data.email)) {
        return { success: false, message: 'Ungültige E-Mail-Adresse' };
      }

      // Validate password
      const passwordValidation = validatePassword(data.password);
      if (!passwordValidation.valid) {
        return { success: false, message: passwordValidation.message };
      }

      // Check if username already exists
      if (storage.getUserByUsername(data.username)) {
        return { success: false, message: 'Benutzername bereits vergeben' };
      }

      // Check if email already exists
      if (storage.getUserByEmail(data.email)) {
        return { success: false, message: 'E-Mail-Adresse bereits registriert' };
      }

      // Hash password
      const passwordHash = await hashPassword(data.password);

      // Check for invite code first
      let teamId: string | undefined;
      let teamRole: 'owner' | 'admin' | 'member' | undefined;

      if (data.inviteCode) {
        // User is joining via invite code
        const invitation = storage.getTeamInvitationByCode(data.inviteCode.trim().toUpperCase());

        if (!invitation) {
          return { success: false, message: 'Ungültiger Einladungscode' };
        }

        // Check if invitation is already used
        if (invitation.usedBy) {
          return { success: false, message: 'Dieser Einladungscode wurde bereits verwendet' };
        }

        // Check if invitation is expired
        const expiresAt = new Date(invitation.expiresAt);
        if (expiresAt < new Date()) {
          return { success: false, message: 'Dieser Einladungscode ist abgelaufen' };
        }

        // Get the team
        const team = storage.getTeamById(invitation.teamId);
        if (!team) {
          return { success: false, message: 'Team nicht gefunden' };
        }

        teamId = team.id;
        teamRole = invitation.role;

        // Override account type to match team
        data.accountType = 'team';
        data.organizationName = team.name;
      } else {
        // Create team if account type is team (creating new team, not joining)
        teamId = data.accountType === 'team' ? crypto.randomUUID() : undefined;

        if (teamId && data.organizationName) {
          storage.addTeam({
            id: teamId,
            name: data.organizationName,
            ownerId: crypto.randomUUID(), // Will be updated with user id
            createdAt: new Date().toISOString()
          });
        }

        teamRole = data.accountType === 'team' ? 'owner' : undefined;
      }

      // Create new user
      const newUser: User = {
        id: crypto.randomUUID(),
        username: data.username,
        email: data.email,
        passwordHash,
        accountType: data.accountType,
        organizationName: data.organizationName,
        teamId: teamId,
        teamRole: teamRole,
        mfaEnabled: false,
        accentColor: 'blue', // Default accent color
        grayTone: 'medium', // Default gray tone
        timeRoundingInterval: 15, // Default: 15 minutes rounding
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString()
      };

      // Update team owner if creating new team
      if (teamId && !data.inviteCode && data.accountType === 'team') {
        storage.updateTeam(teamId, { ownerId: newUser.id });
      }

      // Mark invitation as used if joining via invite code
      if (data.inviteCode) {
        storage.useTeamInvitation(data.inviteCode.trim().toUpperCase(), newUser.id);
      }

      // Save user
      storage.addUser(newUser);
      storage.setCurrentUser(newUser);
      setCurrentUser(newUser);

      // Apply default theme
      accentColor.set(newUser.accentColor);
      grayTone.set(newUser.grayTone);
      applyAccentColorToRoot(newUser.accentColor);

      return { success: true };
    } catch (error) {
      console.error('Registration error:', error);
      return { success: false, message: 'Ein Fehler ist aufgetreten' };
    }
  };

  const logout = () => {
    storage.clearCurrentUser();
    setCurrentUser(null);
  };

  const updateAccentColor = (color: AccentColor) => {
    if (!currentUser) return;

    // Update user in storage
    storage.updateUser(currentUser.id, { accentColor: color });

    // Update local state
    const updatedUser = { ...currentUser, accentColor: color };
    setCurrentUser(updatedUser);
    storage.setCurrentUser(updatedUser);

    // Update accent color utility and apply to DOM
    accentColor.set(color);
    applyAccentColorToRoot(color);
  };

  const updateGrayTone = (tone: GrayTone) => {
    if (!currentUser) return;

    // Update user in storage
    storage.updateUser(currentUser.id, { grayTone: tone });

    // Update local state
    const updatedUser = { ...currentUser, grayTone: tone };
    setCurrentUser(updatedUser);
    storage.setCurrentUser(updatedUser);

    // Update gray tone utility and apply to DOM
    grayTone.set(tone);
  };

  const updateTimeRoundingInterval = (interval: TimeRoundingInterval) => {
    if (!currentUser) return;

    // Update user in storage
    storage.updateUser(currentUser.id, { timeRoundingInterval: interval });

    // Update local state
    const updatedUser = { ...currentUser, timeRoundingInterval: interval };
    setCurrentUser(updatedUser);
    storage.setCurrentUser(updatedUser);
  };

  const value: AuthContextType = {
    currentUser,
    isAuthenticated: !!currentUser,
    isLoading,
    login,
    register,
    logout,
    updateAccentColor,
    updateGrayTone,
    updateTimeRoundingInterval
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
