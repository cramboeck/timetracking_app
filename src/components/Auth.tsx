import { useState, useEffect } from 'react';
import { Mail, Lock, User, Shield, Building2, Users, Ticket, UserPlus, CheckCircle, XCircle } from 'lucide-react';
import logoRamboeck from '../logo/logo-ramboeckit.png';
import { useAuth } from '../contexts/AuthContext';
import { AccountType } from '../types';
import { ForgotPassword } from './ForgotPassword';
import { ResetPassword } from './ResetPassword';
import { organizationsApi } from '../services/api';
import { Button } from './ui';

type AuthView = 'login' | 'register' | 'forgot-password' | 'reset-password' | 'join-organization';

interface InvitationInfo {
  organizationName: string;
  logo: string | null;
  role: string;
  invitedBy: string;
  expiresAt: string;
  invitedEmail?: string;
  userAlreadyExists?: boolean;
}

export const Auth = () => {
  const { login, verifyMfa, register } = useAuth();
  const [authView, setAuthView] = useState<AuthView>('login');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [resetToken, setResetToken] = useState<string | null>(null);

  // MFA state
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [mfaAttemptsLeft, setMfaAttemptsLeft] = useState<number | undefined>();
  const [mfaLockedUntil, setMfaLockedUntil] = useState<Date | undefined>();
  const [trustDevice, setTrustDevice] = useState(false);

  // Invitation state
  const [invitationCode, setInvitationCode] = useState<string | null>(null);
  const [invitationInfo, setInvitationInfo] = useState<InvitationInfo | null>(null);
  const [invitationError, setInvitationError] = useState<string | null>(null);
  const [invitationLoading, setInvitationLoading] = useState(false);

  // Check URL for reset token or invitation code
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const pathname = window.location.pathname;

    // Check for password reset token
    if (token) {
      setResetToken(token);
      setAuthView('reset-password');
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }

    // Check for invitation link (/join/:code)
    const joinMatch = pathname.match(/^\/join\/([a-zA-Z0-9]+)$/);
    if (joinMatch) {
      const code = joinMatch[1];
      setInvitationCode(code);
      setAuthView('join-organization');
      loadInvitationInfo(code);
    }
  }, []);

  // Load invitation info from API
  const loadInvitationInfo = async (code: string) => {
    setInvitationLoading(true);
    setInvitationError(null);
    try {
      const response = await organizationsApi.getInvitationInfo(code);
      if (response.success) {
        setInvitationInfo(response.data);
      }
    } catch (err: any) {
      setInvitationError(err.message || 'Einladung nicht gefunden oder abgelaufen');
    } finally {
      setInvitationLoading(false);
    }
  };

  // Login form
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginMfaCode, setLoginMfaCode] = useState('');

  // Register form
  const [registerUsername, setRegisterUsername] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerPasswordConfirm, setRegisterPasswordConfirm] = useState('');
  const [registerAccountType, setRegisterAccountType] = useState<AccountType>('personal');
  const [registerOrganizationName, setRegisterOrganizationName] = useState('');
  const [registerInviteCode, setRegisterInviteCode] = useState('');

  // Track if registering via invitation (to show simplified form)
  const [registeringViaInvitation, setRegisteringViaInvitation] = useState(false);
  const [invitationOrgName, setInvitationOrgName] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    const result = await login({
      username: loginUsername,
      password: loginPassword
    });

    if (result.mfaRequired && result.mfaToken) {
      // MFA is required, show MFA form
      setMfaRequired(true);
      setMfaToken(result.mfaToken);
      setLoginMfaCode('');
      setIsLoading(false);
      return;
    }

    if (!result.success) {
      setError(result.message || 'Login fehlgeschlagen');
    }

    setIsLoading(false);
  };

  const handleMfaVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    if (!mfaToken) {
      setError('MFA-Token fehlt. Bitte erneut anmelden.');
      setIsLoading(false);
      return;
    }

    // Check if still locked
    if (mfaLockedUntil && mfaLockedUntil > new Date()) {
      const secondsLeft = Math.ceil((mfaLockedUntil.getTime() - Date.now()) / 1000);
      const minutesLeft = Math.ceil(secondsLeft / 60);
      setError(`Zu viele Fehlversuche. Bitte warte noch ${minutesLeft} Minute${minutesLeft > 1 ? 'n' : ''}.`);
      setIsLoading(false);
      return;
    }

    const result = await verifyMfa(mfaToken, loginMfaCode, trustDevice);

    if (!result.success) {
      // Handle rate limiting
      if (result.retryAfter) {
        setMfaLockedUntil(new Date(Date.now() + result.retryAfter * 1000));
        setMfaAttemptsLeft(0);
      } else {
        setMfaAttemptsLeft(result.attemptsLeft);
      }
      setError(result.message || 'Ungültiger Code');
    }

    setIsLoading(false);
  };

  const handleCancelMfa = () => {
    setMfaRequired(false);
    setMfaToken(null);
    setLoginMfaCode('');
    setLoginPassword('');
    setError('');
    setMfaAttemptsLeft(undefined);
    setMfaLockedUntil(undefined);
    setTrustDevice(false);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (registerPassword !== registerPasswordConfirm) {
      setError('Passwörter stimmen nicht überein');
      return;
    }

    // Only require organization name for business/team if NOT registering via invitation
    if (!registeringViaInvitation && (registerAccountType === 'business' || registerAccountType === 'team') && !registerOrganizationName.trim()) {
      setError('Bitte gib einen Firmennamen/Team-Namen ein');
      return;
    }

    setIsLoading(true);

    // Check for pending invitation from localStorage (from /join/:code flow)
    const pendingInvitation = localStorage.getItem('pending_invitation');
    const effectiveInviteCode = pendingInvitation || registerInviteCode.trim() || undefined;

    const result = await register({
      username: registerUsername,
      email: registerEmail,
      password: registerPassword,
      accountType: registeringViaInvitation ? 'personal' : registerAccountType, // Use personal when joining via invitation
      organizationName: registeringViaInvitation ? undefined : (registerOrganizationName.trim() || undefined),
      inviteCode: effectiveInviteCode
    });

    if (!result.success) {
      setError(result.message || 'Registrierung fehlgeschlagen');
    } else {
      // Clear invitation-related state after successful registration
      if (pendingInvitation) {
        localStorage.removeItem('pending_invitation');
      }
      setRegisteringViaInvitation(false);
      setInvitationOrgName(null);
    }

    setIsLoading(false);
    // On success, AuthContext will update and user will be logged in
  };

  // Show ForgotPassword component
  if (authView === 'forgot-password') {
    return <ForgotPassword onBack={() => setAuthView('login')} />;
  }

  // Show ResetPassword component
  if (authView === 'reset-password' && resetToken) {
    return (
      <ResetPassword
        token={resetToken}
        onSuccess={() => {
          setAuthView('login');
          setResetToken(null);
        }}
        onBack={() => {
          setAuthView('login');
          setResetToken(null);
        }}
      />
    );
  }

  // Show JoinOrganization view
  if (authView === 'join-organization' && invitationCode) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-dark-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-accent-primary/10 mb-4">
              <UserPlus size={32} className="text-accent-primary" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              Team beitreten
            </h1>
            <p className="text-gray-600 dark:text-dark-400">
              Du wurdest eingeladen, einem Team beizutreten
            </p>
          </div>

          {/* Invitation Card */}
          <div className="bg-white dark:bg-dark-100 rounded-2xl shadow-xl p-8">
            {invitationLoading && (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-primary mx-auto mb-4"></div>
                <p className="text-gray-600 dark:text-dark-400">Einladung wird geladen...</p>
              </div>
            )}

            {invitationError && (
              <div className="text-center py-8">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 mb-4">
                  <XCircle size={32} className="text-red-600 dark:text-red-400" />
                </div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                  Einladung ungültig
                </h2>
                <p className="text-gray-600 dark:text-dark-400 mb-6">
                  {invitationError}
                </p>
                <Button
                  onClick={() => {
                    window.history.replaceState({}, '', '/');
                    setAuthView('login');
                    setInvitationCode(null);
                  }}
                >
                  Zur Anmeldung
                </Button>
              </div>
            )}

            {invitationInfo && (
              <div>
                {/* Organization Info */}
                <div className="text-center mb-6 pb-6 border-b border-gray-200 dark:border-dark-border">
                  {invitationInfo.logo ? (
                    <img src={invitationInfo.logo} alt="" className="w-20 h-20 rounded-xl mx-auto mb-4 object-contain" />
                  ) : (
                    <div className="w-20 h-20 rounded-xl bg-accent-primary/10 flex items-center justify-center mx-auto mb-4">
                      <Building2 size={36} className="text-accent-primary" />
                    </div>
                  )}
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                    {invitationInfo.organizationName}
                  </h2>
                  <p className="text-sm text-gray-600 dark:text-dark-400 mt-1">
                    Eingeladen von {invitationInfo.invitedBy}
                  </p>
                </div>

                {/* Role Info */}
                <div className="bg-gray-50 dark:bg-dark-200/50 rounded-lg p-4 mb-6">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-dark-400">Deine Rolle:</span>
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                      invitationInfo.role === 'admin'
                        ? 'bg-accent-lighter dark:bg-accent-primary/30 text-accent-primary dark:text-accent-primary'
                        : invitationInfo.role === 'viewer'
                        ? 'bg-gray-100 dark:bg-dark-300 text-gray-600 dark:text-dark-500'
                        : 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                    }`}>
                      {invitationInfo.role === 'admin' ? 'Admin' : invitationInfo.role === 'viewer' ? 'Viewer' : 'Mitglied'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-dark-400 mt-2">
                    Gültig bis {new Date(invitationInfo.expiresAt).toLocaleDateString('de-DE', {
                      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
                    })}
                  </p>
                </div>

                {/* Action */}
                <div className="space-y-4">
                  {invitationInfo.userAlreadyExists ? (
                    <>
                      <div className="bg-accent-light dark:bg-accent-primary/20 border border-accent-primary/30 dark:border-accent-primary/40 rounded-lg p-3">
                        <p className="text-sm text-accent-dark dark:text-accent-primary text-center">
                          <strong>Du hast bereits ein Konto</strong> mit der E-Mail-Adresse {invitationInfo.invitedEmail}. Bitte melde dich an, um der Organisation beizutreten.
                        </p>
                      </div>
                      <Button
                        onClick={() => {
                          // Store invitation code for after login
                          localStorage.setItem('pending_invitation', invitationCode);
                          window.history.replaceState({}, '', '/');
                          setAuthView('login');
                        }}
                        size="lg"
                        className="w-full"
                      >
                        Anmelden
                      </Button>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-gray-600 dark:text-dark-400 text-center">
                        Du wurdest eingeladen für: <strong>{invitationInfo.invitedEmail}</strong>
                      </p>
                      <p className="text-xs text-gray-500 dark:text-dark-400 text-center">
                        Falls du bereits ein Konto hast, melde dich an. Ansonsten registriere dich mit einem neuen Account.
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        <Button
                          onClick={() => {
                            // Store invitation code for after login
                            localStorage.setItem('pending_invitation', invitationCode);
                            window.history.replaceState({}, '', '/');
                            setAuthView('login');
                          }}
                          size="lg"
                        >
                          Anmelden
                        </Button>
                        <Button
                          onClick={() => {
                            // Store invitation code and set registration via invitation mode
                            localStorage.setItem('pending_invitation', invitationCode);
                            setRegisteringViaInvitation(true);
                            setInvitationOrgName(invitationInfo?.organizationName || null);
                            window.history.replaceState({}, '', '/');
                            setAuthView('register');
                          }}
                          variant="outline"
                          size="lg"
                        >
                          Registrieren
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Back Link */}
          <div className="text-center mt-6">
            <Button
              onClick={() => {
                window.history.replaceState({}, '', '/');
                setAuthView('login');
                setInvitationCode(null);
              }}
              variant="ghost"
              size="sm"
            >
              Zurück zur normalen Anmeldung
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const isLogin = authView === 'login';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo/Header */}
        <div className="text-center mb-8">
          {/* Company logo – light mode uses the original, dark mode inverts to white */}
          <img
            src={logoRamboeck}
            alt="Ramboeck IT"
            className="h-14 mx-auto mb-4 object-contain dark:brightness-0 dark:invert"
          />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
            RamboFlow
          </h1>
          <p className="text-sm text-gray-500 dark:text-dark-400">
            Zeiterfassung & Projektmanagement
          </p>
        </div>

        {/* Auth Card */}
        <div className="bg-white dark:bg-dark-100 rounded-2xl shadow-xl border border-gray-200 dark:border-dark-border overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-gray-200 dark:border-dark-border">
            <button
              onClick={() => {
                setAuthView('login');
                setError('');
              }}
              className={`flex-1 px-6 py-4 font-semibold transition-colors ${
                isLogin
                  ? 'bg-white dark:bg-dark-100 text-accent-primary border-b-2 border-accent-primary'
                  : 'bg-gray-50 dark:bg-dark-50 text-gray-600 dark:text-dark-400'
              }`}
            >
              Anmelden
            </button>
            <button
              onClick={() => {
                setAuthView('register');
                setError('');
              }}
              className={`flex-1 px-6 py-4 font-semibold transition-colors ${
                !isLogin
                  ? 'bg-white dark:bg-dark-100 text-accent-primary border-b-2 border-accent-primary'
                  : 'bg-gray-50 dark:bg-dark-50 text-gray-600 dark:text-dark-400'
              }`}
            >
              Registrieren
            </button>
          </div>

          <div className="p-6">
            {/* Error Message */}
            {error && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            {/* Login Form */}
            {isLogin ? (
              mfaRequired ? (
                /* MFA Verification Form */
                <form onSubmit={handleMfaVerify} className="space-y-4">
                  <div className="flex items-center gap-3 p-4 bg-accent-light dark:bg-accent-primary/20 rounded-lg">
                    <Shield className="text-accent-primary dark:text-accent-primary" size={24} />
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">
                        Zwei-Faktor-Authentifizierung
                      </p>
                      <p className="text-sm text-gray-600 dark:text-dark-400">
                        Gib den Code aus deiner Authenticator-App ein
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
                      6-stelliger Code
                    </label>
                    <input
                      type="text"
                      value={loginMfaCode}
                      onChange={(e) => setLoginMfaCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                      placeholder="000000"
                      className={`w-full px-4 py-3 text-center text-2xl font-mono tracking-widest border rounded-lg bg-white dark:bg-dark-200 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary ${
                        mfaAttemptsLeft !== undefined && mfaAttemptsLeft <= 2
                          ? 'border-amber-500 dark:border-amber-400'
                          : 'border-gray-300 dark:border-dark-border'
                      }`}
                      autoFocus
                      autoComplete="one-time-code"
                      disabled={mfaLockedUntil !== undefined && mfaLockedUntil > new Date()}
                    />
                    <p className="text-xs text-gray-500 dark:text-dark-400 mt-2">
                      Du kannst auch einen 8-stelligen Wiederherstellungscode verwenden
                    </p>
                    {mfaAttemptsLeft !== undefined && mfaAttemptsLeft > 0 && mfaAttemptsLeft <= 3 && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 font-medium">
                        Noch {mfaAttemptsLeft} Versuch{mfaAttemptsLeft > 1 ? 'e' : ''} übrig
                      </p>
                    )}
                  </div>

                  {/* Trust this device checkbox */}
                  <label className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-dark-200/50 cursor-pointer hover:bg-gray-100 dark:hover:bg-dark-200 transition-colors">
                    <input
                      type="checkbox"
                      checked={trustDevice}
                      onChange={(e) => setTrustDevice(e.target.checked)}
                      className="w-5 h-5 rounded border-gray-300 dark:border-dark-border text-accent-primary focus:ring-accent-primary"
                    />
                    <div>
                      <span className="text-sm font-medium text-gray-700 dark:text-dark-500">
                        Diesem Gerät vertrauen
                      </span>
                      <p className="text-xs text-gray-500 dark:text-dark-400">
                        30 Tage ohne MFA-Abfrage auf diesem Browser
                      </p>
                    </div>
                  </label>

                  <div className="flex gap-3">
                    <Button
                      type="button"
                      onClick={handleCancelMfa}
                      variant="secondary"
                      size="lg"
                      fullWidth
                    >
                      Abbrechen
                    </Button>
                    <Button
                      type="submit"
                      disabled={loginMfaCode.length < 6 || (mfaLockedUntil !== undefined && mfaLockedUntil > new Date())}
                      loading={isLoading}
                      size="lg"
                      fullWidth
                    >
                      {isLoading ? 'Überprüfen...' : 'Bestätigen'}
                    </Button>
                  </div>
                </form>
              ) : (
                /* Normal Login Form */
                <form onSubmit={handleLogin} className="space-y-4" autoComplete="on">
                  <div>
                    <label htmlFor="login-username" className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
                      Benutzername
                    </label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                      <input
                        id="login-username"
                        name="username"
                        type="text"
                        value={loginUsername}
                        onChange={(e) => setLoginUsername(e.target.value)}
                        placeholder="Benutzername eingeben"
                        className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-200 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary"
                        required
                        autoFocus
                        autoComplete="username"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label htmlFor="login-password" className="block text-sm font-medium text-gray-700 dark:text-dark-500">
                        Passwort
                      </label>
                      <Button
                        type="button"
                        onClick={() => setAuthView('forgot-password')}
                        variant="ghost"
                        size="sm"
                      >
                        Passwort vergessen?
                      </Button>
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                      <input
                        id="login-password"
                        name="password"
                        type="password"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        placeholder="Passwort eingeben"
                        className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-200 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary"
                        required
                        autoComplete="current-password"
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    loading={isLoading}
                    size="lg"
                    fullWidth
                  >
                    {isLoading ? 'Anmelden...' : 'Anmelden'}
                  </Button>
                </form>
              )
            ) : (
              /* Register Form */
              <form onSubmit={handleRegister} className="space-y-4">
                {/* Invitation Banner - when registering via invitation */}
                {registeringViaInvitation && invitationOrgName && (
                  <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                    <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                      <UserPlus size={20} className="text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <p className="font-medium text-green-800 dark:text-green-200">
                        Du trittst bei: {invitationOrgName}
                      </p>
                      <p className="text-sm text-green-600 dark:text-green-400">
                        Erstelle deinen Account um der Organisation beizutreten
                      </p>
                    </div>
                  </div>
                )}

                {/* Account Type Selection - only show when NOT registering via invitation */}
                {!registeringViaInvitation && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
                      Account-Typ *
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setRegisterAccountType('personal')}
                        className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all ${
                          registerAccountType === 'personal'
                            ? 'border-accent-primary bg-accent-light dark:bg-accent-lighter/10'
                            : 'border-gray-300 dark:border-dark-border hover:border-gray-400'
                        }`}
                      >
                        <User size={24} className={registerAccountType === 'personal' ? 'text-accent-primary' : 'text-gray-400'} />
                        <span className={`text-xs font-medium ${registerAccountType === 'personal' ? 'text-accent-primary' : 'text-gray-600 dark:text-dark-400'}`}>
                          Freelancer
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setRegisterAccountType('business')}
                        className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all ${
                          registerAccountType === 'business'
                            ? 'border-accent-primary bg-accent-light dark:bg-accent-lighter/10'
                            : 'border-gray-300 dark:border-dark-border hover:border-gray-400'
                        }`}
                      >
                        <Building2 size={24} className={registerAccountType === 'business' ? 'text-accent-primary' : 'text-gray-400'} />
                        <span className={`text-xs font-medium ${registerAccountType === 'business' ? 'text-accent-primary' : 'text-gray-600 dark:text-dark-400'}`}>
                          Unternehmen
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setRegisterAccountType('team')}
                        className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all ${
                          registerAccountType === 'team'
                            ? 'border-accent-primary bg-accent-light dark:bg-accent-lighter/10'
                            : 'border-gray-300 dark:border-dark-border hover:border-gray-400'
                        }`}
                      >
                        <Users size={24} className={registerAccountType === 'team' ? 'text-accent-primary' : 'text-gray-400'} />
                        <span className={`text-xs font-medium ${registerAccountType === 'team' ? 'text-accent-primary' : 'text-gray-600 dark:text-dark-400'}`}>
                          Team
                        </span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Organization Name - only for business/team AND not registering via invitation */}
                {!registeringViaInvitation && (registerAccountType === 'business' || registerAccountType === 'team') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
                      {registerAccountType === 'business' ? 'Firmenname' : 'Team-Name'} *
                    </label>
                    <div className="relative">
                      <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                      <input
                        type="text"
                        value={registerOrganizationName}
                        onChange={(e) => setRegisterOrganizationName(e.target.value)}
                        placeholder={registerAccountType === 'business' ? 'z.B. Musterfirma GmbH' : 'z.B. Design Team Alpha'}
                        className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-200 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary"
                        required
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
                    Benutzername *
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                    <input
                      type="text"
                      value={registerUsername}
                      onChange={(e) => setRegisterUsername(e.target.value)}
                      placeholder="3-20 Zeichen, nur a-z, 0-9, _, -"
                      className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-200 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary"
                      required
                      autoFocus={registerAccountType === 'personal'}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
                    E-Mail-Adresse *
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                    <input
                      type="email"
                      value={registerEmail}
                      onChange={(e) => setRegisterEmail(e.target.value)}
                      placeholder="deine@email.de"
                      className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-200 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
                    Passwort *
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                    <input
                      type="password"
                      value={registerPassword}
                      onChange={(e) => setRegisterPassword(e.target.value)}
                      placeholder="Min. 8 Zeichen, Groß-/Kleinbuchstaben, Zahl"
                      className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-200 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-500 mb-2">
                    Passwort bestätigen *
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                    <input
                      type="password"
                      value={registerPasswordConfirm}
                      onChange={(e) => setRegisterPasswordConfirm(e.target.value)}
                      placeholder="Passwort wiederholen"
                      className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-200 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary"
                      required
                    />
                  </div>
                </div>

                {/* Invite Code - Optional - only show when NOT registering via invitation */}
                {!registeringViaInvitation && (
                  <div className="border-t border-gray-200 dark:border-dark-border pt-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Ticket size={18} className="text-gray-500 dark:text-dark-400" />
                      <label className="block text-sm font-medium text-gray-700 dark:text-dark-500">
                        Einladungscode (optional)
                      </label>
                    </div>
                    <input
                      type="text"
                      value={registerInviteCode}
                      onChange={(e) => setRegisterInviteCode(e.target.value.toUpperCase())}
                      placeholder="INVITE-XXXXXXXXX"
                      className="w-full px-4 py-3 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-200 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-primary font-mono text-sm"
                    />
                    <p className="text-xs text-gray-500 dark:text-dark-400 mt-2">
                      💡 Du hast einen Einladungscode? Gib ihn hier ein, um einem bestehenden Team beizutreten
                    </p>
                  </div>
                )}

                <Button
                  type="submit"
                  loading={isLoading}
                  size="lg"
                  fullWidth
                >
                  {isLoading ? 'Registrieren...' : 'Registrieren'}
                </Button>

                <p className="text-xs text-gray-500 dark:text-dark-400 text-center">
                  Mit der Registrierung akzeptierst du unsere Datenschutzbestimmungen
                </p>
              </form>
            )}
          </div>
        </div>

        {/* Footer Note */}
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-500 dark:text-dark-400">
            🔐 Sicher verschlüsselt • MFA-ready • Multi-User Support
          </p>
        </div>
      </div>
    </div>
  );
};
