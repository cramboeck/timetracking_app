import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, LoginCredentials, RegisterData } from '../types';
import { storage } from '../utils/storage';
import { hashPassword, verifyPassword, validatePassword, validateEmail, validateUsername } from '../utils/auth';

interface AuthContextType {
  currentUser: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginCredentials) => Promise<{ success: boolean; message?: string }>;
  register: (data: RegisterData) => Promise<{ success: boolean; message?: string }>;
  logout: () => void;
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

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load current user on mount
  useEffect(() => {
    const user = storage.getCurrentUser();
    setCurrentUser(user);
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

      // Create new user
      const newUser: User = {
        id: crypto.randomUUID(),
        username: data.username,
        email: data.email,
        passwordHash,
        mfaEnabled: false,
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString()
      };

      // Save user
      storage.addUser(newUser);
      storage.setCurrentUser(newUser);
      setCurrentUser(newUser);

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

  const value: AuthContextType = {
    currentUser,
    isAuthenticated: !!currentUser,
    isLoading,
    login,
    register,
    logout
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
