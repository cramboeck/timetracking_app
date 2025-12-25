import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, LoginCredentials, RegisterData, AccentColor, GrayTone, TimeRoundingInterval, TimeFormat } from '../types';
import { storage } from '../utils/storage';
import { validatePassword, validateEmail, validateUsername } from '../utils/auth';
import { accentColor } from '../utils/accentColor';
import { grayTone } from '../utils/theme';
import { darkMode } from '../utils/darkMode';
import { authApi, userApi } from '../services/api';

// Helper to persist settings to backend
const persistSettings = async (settings: Parameters<typeof userApi.updateSettings>[0]) => {
  try {
    await userApi.updateSettings(settings);
  } catch (error) {
    console.error('Failed to persist settings to backend:', error);
    // Don't throw - we still want to update local state for immediate feedback
  }
};

interface LoginResult {
  success: boolean;
  message?: string;
  mfaRequired?: boolean;
  mfaToken?: string;
}

interface MfaVerifyResult {
  success: boolean;
  message?: string;
  attemptsLeft?: number;
  retryAfter?: number; // seconds until retry allowed
}

interface AuthContextType {
  currentUser: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginCredentials) => Promise<LoginResult>;
  verifyMfa: (mfaToken: string, code: string, trustDevice?: boolean) => Promise<MfaVerifyResult>;
  register: (data: RegisterData) => Promise<{ success: boolean; message?: string }>;
  logout: () => void;
  updateAccentColor: (color: AccentColor) => void;
  updateGrayTone: (tone: GrayTone) => void;
  updateDarkMode: (enabled: boolean) => void;
  updateTimeRoundingInterval: (interval: TimeRoundingInterval) => void;
  updateTimeFormat: (format: TimeFormat) => void;
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
    const loadUser = async () => {
      console.log('🔄 [INIT] Checking for existing session...');

      // Check if JWT token exists
      const token = localStorage.getItem('auth_token');

      if (!token) {
        console.log('ℹ️ [INIT] No token found - user not logged in');
        setIsLoading(false);
        return;
      }

      console.log('🔄 [INIT] Token found, fetching user data...');

      // Check for cached user data first (for offline support)
      const cachedUser = storage.getCurrentUser();

      try {
        // Check if we're online before trying to fetch
        if (!navigator.onLine) {
          console.log('📴 [INIT] Offline - using cached user data');
          if (cachedUser) {
            setCurrentUser(cachedUser);
            // Initialize theme from cached user preferences
            accentColor.set(cachedUser.accentColor);
            grayTone.set(cachedUser.grayTone);
            darkMode.syncFromUser(cachedUser.darkMode);
            applyAccentColorToRoot(cachedUser.accentColor);
            console.log('✅ [INIT] Loaded from cache:', cachedUser.username);
          } else {
            console.log('⚠️ [INIT] Offline and no cached user - staying logged out');
          }
          setIsLoading(false);
          return;
        }

        // Fetch user data from backend
        const userResponse = await userApi.getMe();
        console.log('✅ [INIT] User data loaded:', userResponse);

        const user = userResponse.data as User;
        setCurrentUser(user);

        // Cache user data for offline use
        storage.setCurrentUser(user);

        // Initialize theme from user preferences
        accentColor.set(user.accentColor);
        grayTone.set(user.grayTone);
        darkMode.syncFromUser(user.darkMode);
        applyAccentColorToRoot(user.accentColor);
        console.log('✅ [INIT] Theme initialized:', { accentColor: user.accentColor, grayTone: user.grayTone, darkMode: user.darkMode });
      } catch (error) {
        console.error('❌ [INIT] Failed to load user:', error);

        // Check if it's a network error - if so, use cached data
        if (!navigator.onLine || (error instanceof TypeError && error.message.includes('fetch'))) {
          console.log('📴 [INIT] Network error - using cached user data');
          if (cachedUser) {
            setCurrentUser(cachedUser);
            accentColor.set(cachedUser.accentColor);
            grayTone.set(cachedUser.grayTone);
            darkMode.syncFromUser(cachedUser.darkMode);
            applyAccentColorToRoot(cachedUser.accentColor);
            console.log('✅ [INIT] Loaded from cache:', cachedUser.username);
          }
        } else {
          // Only clear token if we're online and it's truly invalid
          console.log('❌ [INIT] Token invalid, clearing...');
          localStorage.removeItem('auth_token');
          storage.setCurrentUser(null);
        }
      }

      setIsLoading(false);
      console.log('✅ [INIT] Initialization complete');
    };

    loadUser();
  }, []);

  const login = async (credentials: LoginCredentials): Promise<LoginResult> => {
    try {
      console.log('🔐 [AUTH] Starting login process...');
      console.log('🔐 [AUTH] Username:', credentials.username);

      // Call backend API
      console.log('🔐 [AUTH] Calling backend API: POST /auth/login');
      const loginResponse = await authApi.login(credentials.username, credentials.password);
      console.log('✅ [AUTH] Backend login response:', loginResponse);

      // Check if MFA is required
      if (loginResponse.mfaRequired) {
        console.log('🔐 [AUTH] MFA required for this user');
        return {
          success: true,
          mfaRequired: true,
          mfaToken: loginResponse.mfaToken
        };
      }

      // Token is automatically stored by authApi.login()
      console.log('🔐 [AUTH] JWT Token stored in localStorage');

      // Fetch user data from backend
      console.log('🔐 [AUTH] Fetching user data from backend...');
      const userResponse = await userApi.getMe();
      console.log('✅ [AUTH] User data received:', userResponse);

      const user = userResponse.data as User;

      // Store user in state and cache for offline use
      setCurrentUser(user);
      storage.setCurrentUser(user);
      console.log('✅ [AUTH] User stored in React state and cached');

      // Apply user's theme
      accentColor.set(user.accentColor);
      grayTone.set(user.grayTone);
      darkMode.syncFromUser(user.darkMode);
      applyAccentColorToRoot(user.accentColor);
      console.log('✅ [AUTH] Theme applied:', { accentColor: user.accentColor, grayTone: user.grayTone, darkMode: user.darkMode });

      console.log('🎉 [AUTH] Login complete!');
      return { success: true };
    } catch (error) {
      console.error('❌ [AUTH] Login error:', error);
      return { success: false, message: 'Benutzername oder Passwort falsch' };
    }
  };

  const verifyMfa = async (mfaToken: string, code: string, trustDevice: boolean = false): Promise<MfaVerifyResult> => {
    try {
      console.log('🔐 [AUTH] Verifying MFA code...', { trustDevice });

      // Call backend API
      const mfaResponse = await authApi.verifyMfa(mfaToken, code, trustDevice);
      console.log('✅ [AUTH] MFA verification successful!', mfaResponse);

      // Token is automatically stored by authApi.verifyMfa()
      console.log('🔐 [AUTH] JWT Token stored in localStorage');

      // Fetch user data from backend
      console.log('🔐 [AUTH] Fetching user data from backend...');
      const userResponse = await userApi.getMe();
      console.log('✅ [AUTH] User data received:', userResponse);

      const user = userResponse.data as User;

      // Store user in state and cache for offline use
      setCurrentUser(user);
      storage.setCurrentUser(user);
      console.log('✅ [AUTH] User stored in React state and cached');

      // Apply user's theme
      accentColor.set(user.accentColor);
      grayTone.set(user.grayTone);
      darkMode.syncFromUser(user.darkMode);
      applyAccentColorToRoot(user.accentColor);
      console.log('✅ [AUTH] Theme applied:', { accentColor: user.accentColor, grayTone: user.grayTone, darkMode: user.darkMode });

      console.log('🎉 [AUTH] MFA verification complete!');
      return { success: true };
    } catch (error: any) {
      console.error('❌ [AUTH] MFA verification error:', error);
      return {
        success: false,
        message: error.message || 'Ungültiger Code',
        attemptsLeft: error.attemptsLeft,
        retryAfter: error.retryAfter
      };
    }
  };

  const register = async (data: RegisterData): Promise<{ success: boolean; message?: string }> => {
    try {
      console.log('📝 [REGISTER] Starting registration process...');
      console.log('📝 [REGISTER] Data:', { username: data.username, email: data.email, accountType: data.accountType });

      // Validate username
      console.log('📝 [REGISTER] Validating username...');
      const usernameValidation = validateUsername(data.username);
      if (!usernameValidation.valid) {
        console.log('❌ [REGISTER] Username validation failed:', usernameValidation.message);
        return { success: false, message: usernameValidation.message };
      }

      // Validate email
      console.log('📝 [REGISTER] Validating email...');
      if (!validateEmail(data.email)) {
        console.log('❌ [REGISTER] Email validation failed');
        return { success: false, message: 'Ungültige E-Mail-Adresse' };
      }

      // Validate password
      console.log('📝 [REGISTER] Validating password...');
      const passwordValidation = validatePassword(data.password);
      if (!passwordValidation.valid) {
        console.log('❌ [REGISTER] Password validation failed:', passwordValidation.message);
        return { success: false, message: passwordValidation.message };
      }

      console.log('✅ [REGISTER] All validations passed');

      // Call backend API
      console.log('📝 [REGISTER] Calling backend API: POST /auth/register');
      const registerResponse = await authApi.register({
        username: data.username,
        email: data.email,
        password: data.password,
        accountType: data.accountType,
        organizationName: data.organizationName,
        inviteCode: data.inviteCode
      });
      console.log('✅ [REGISTER] Backend registration successful!', registerResponse);

      // Token is automatically stored by authApi.register()
      console.log('📝 [REGISTER] JWT Token stored in localStorage');

      // Fetch user data from backend
      console.log('📝 [REGISTER] Fetching user data from backend...');
      const userResponse = await userApi.getMe();
      console.log('✅ [REGISTER] User data received:', userResponse);

      const user = userResponse.data as User;

      // Store user in state and cache for offline use
      setCurrentUser(user);
      storage.setCurrentUser(user);
      console.log('✅ [REGISTER] User stored in React state and cached');

      // Apply default theme
      accentColor.set(user.accentColor);
      grayTone.set(user.grayTone);
      darkMode.syncFromUser(user.darkMode);
      applyAccentColorToRoot(user.accentColor);
      console.log('✅ [REGISTER] Theme applied:', { accentColor: user.accentColor, grayTone: user.grayTone, darkMode: user.darkMode });

      console.log('🎉 [REGISTER] Registration complete!');
      return { success: true };
    } catch (error: any) {
      console.error('❌ [REGISTER] Registration error:', error);
      // Extract error message from API response if available
      const errorMessage = error.message || 'Ein Fehler ist aufgetreten';
      console.error('❌ [REGISTER] Error message:', errorMessage);
      return { success: false, message: errorMessage };
    }
  };

  const logout = () => {
    console.log('👋 [LOGOUT] Logging out...');
    // Remove JWT token from localStorage
    authApi.logout();
    setCurrentUser(null);
    console.log('✅ [LOGOUT] Logged out successfully');
  };

  const updateAccentColor = (color: AccentColor) => {
    if (!currentUser) return;

    // Persist to backend
    persistSettings({ accentColor: color });

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

    // Persist to backend
    persistSettings({ grayTone: tone });

    // Update local state
    const updatedUser = { ...currentUser, grayTone: tone };
    setCurrentUser(updatedUser);
    storage.setCurrentUser(updatedUser);

    // Update gray tone utility and apply to DOM
    grayTone.set(tone);
  };

  const updateDarkMode = (enabled: boolean) => {
    if (!currentUser) return;

    // Persist to backend
    persistSettings({ darkMode: enabled });

    // Update local state
    const updatedUser = { ...currentUser, darkMode: enabled };
    setCurrentUser(updatedUser);
    storage.setCurrentUser(updatedUser);

    // Update dark mode utility and apply to DOM
    darkMode.set(enabled);
  };

  const updateTimeRoundingInterval = (interval: TimeRoundingInterval) => {
    if (!currentUser) return;

    // Persist to backend
    persistSettings({ timeRoundingInterval: interval });

    // Update local state
    const updatedUser = { ...currentUser, timeRoundingInterval: interval };
    setCurrentUser(updatedUser);
    storage.setCurrentUser(updatedUser);
  };

  const updateTimeFormat = (format: TimeFormat) => {
    if (!currentUser) return;

    // Persist to backend
    persistSettings({ timeFormat: format });

    // Update local state
    const updatedUser = { ...currentUser, timeFormat: format };
    setCurrentUser(updatedUser);
    storage.setCurrentUser(updatedUser);
  };

  const value: AuthContextType = {
    currentUser,
    isAuthenticated: !!currentUser,
    isLoading,
    login,
    verifyMfa,
    register,
    logout,
    updateAccentColor,
    updateGrayTone,
    updateDarkMode,
    updateTimeRoundingInterval,
    updateTimeFormat
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
