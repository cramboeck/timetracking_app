import { useState, useEffect } from 'react';
import { Clock, Mail, Lock, User, Shield, Building2, Users, Ticket } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { AccountType } from '../types';
import { ForgotPassword } from './ForgotPassword';
import { ResetPassword } from './ResetPassword';

type AuthView = 'login' | 'register' | 'forgot-password' | 'reset-password';

export const Auth = () => {
  const { login, verifyMfa, register } = useAuth();
  const [authView, setAuthView] = useState<AuthView>('login');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [resetToken, setResetToken] = useState<string | null>(null);

  // MFA state
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaToken, setMfaToken] = useState<string | null>(null);

  // Check URL for reset token
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');

    if (token) {
      setResetToken(token);
      setAuthView('reset-password');
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

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

    const result = await verifyMfa(mfaToken, loginMfaCode);

    if (!result.success) {
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
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (registerPassword !== registerPasswordConfirm) {
      setError('Passwörter stimmen nicht überein');
      return;
    }

    if ((registerAccountType === 'business' || registerAccountType === 'team') && !registerOrganizationName.trim()) {
      setError('Bitte gib einen Firmennamen/Team-Namen ein');
      return;
    }

    setIsLoading(true);

    const result = await register({
      username: registerUsername,
      email: registerEmail,
      password: registerPassword,
      accountType: registerAccountType,
      organizationName: registerOrganizationName.trim() || undefined,
      inviteCode: registerInviteCode.trim() || undefined
    });

    if (!result.success) {
      setError(result.message || 'Registrierung fehlgeschlagen');
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

  const isLogin = authView === 'login';

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo/Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-full mb-4">
            <Clock className="text-white" size={32} />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            RamboFlow
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Professionelle Zeiterfassung & Projektmanagement
          </p>
        </div>

        {/* Auth Card */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-gray-200 dark:border-gray-700">
            <button
              onClick={() => {
                setAuthView('login');
                setError('');
              }}
              className={`flex-1 px-6 py-4 font-semibold transition-colors ${
                isLogin
                  ? 'bg-white dark:bg-gray-800 text-accent-primary border-b-2 border-accent-primary'
                  : 'bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400'
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
                  ? 'bg-white dark:bg-gray-800 text-accent-primary border-b-2 border-accent-primary'
                  : 'bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400'
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
                  <div className="flex items-center gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <Shield className="text-blue-600 dark:text-blue-400" size={24} />
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">
                        Zwei-Faktor-Authentifizierung
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Gib den Code aus deiner Authenticator-App ein
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      6-stelliger Code
                    </label>
                    <input
                      type="text"
                      value={loginMfaCode}
                      onChange={(e) => setLoginMfaCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                      placeholder="000000"
                      className="w-full px-4 py-3 text-center text-2xl font-mono tracking-widest border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      autoFocus
                      autoComplete="one-time-code"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                      Du kannst auch einen 8-stelligen Wiederherstellungscode verwenden
                    </p>
                  </div>

                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={handleCancelMfa}
                      className="flex-1 py-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg font-medium transition-colors"
                    >
                      Abbrechen
                    </button>
                    <button
                      type="submit"
                      disabled={isLoading || loginMfaCode.length < 6}
                      className="flex-1 py-3 btn-accent disabled:opacity-50"
                    >
                      {isLoading ? 'Überprüfen...' : 'Bestätigen'}
                    </button>
                  </div>
                </form>
              ) : (
                /* Normal Login Form */
                <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Benutzername
                    </label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                      <input
                        type="text"
                        value={loginUsername}
                        onChange={(e) => setLoginUsername(e.target.value)}
                        placeholder="Benutzername eingeben"
                        className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                        autoFocus
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Passwort
                      </label>
                      <button
                        type="button"
                        onClick={() => setAuthView('forgot-password')}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline transition-colors"
                      >
                        Passwort vergessen?
                      </button>
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                      <input
                        type="password"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        placeholder="Passwort eingeben"
                        className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-3 btn-accent"
                  >
                    {isLoading ? 'Anmelden...' : 'Anmelden'}
                  </button>
                </form>
              )
            ) : (
              /* Register Form */
              <form onSubmit={handleRegister} className="space-y-4">
                {/* Account Type Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Account-Typ *
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setRegisterAccountType('personal')}
                      className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all ${
                        registerAccountType === 'personal'
                          ? 'border-accent-primary bg-accent-light dark:bg-accent-lighter/10'
                          : 'border-gray-300 dark:border-gray-600 hover:border-gray-400'
                      }`}
                    >
                      <User size={24} className={registerAccountType === 'personal' ? 'text-accent-primary' : 'text-gray-400'} />
                      <span className={`text-xs font-medium ${registerAccountType === 'personal' ? 'text-accent-primary' : 'text-gray-600 dark:text-gray-400'}`}>
                        Freelancer
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setRegisterAccountType('business')}
                      className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all ${
                        registerAccountType === 'business'
                          ? 'border-accent-primary bg-accent-light dark:bg-accent-lighter/10'
                          : 'border-gray-300 dark:border-gray-600 hover:border-gray-400'
                      }`}
                    >
                      <Building2 size={24} className={registerAccountType === 'business' ? 'text-accent-primary' : 'text-gray-400'} />
                      <span className={`text-xs font-medium ${registerAccountType === 'business' ? 'text-accent-primary' : 'text-gray-600 dark:text-gray-400'}`}>
                        Unternehmen
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setRegisterAccountType('team')}
                      className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all ${
                        registerAccountType === 'team'
                          ? 'border-accent-primary bg-accent-light dark:bg-accent-lighter/10'
                          : 'border-gray-300 dark:border-gray-600 hover:border-gray-400'
                      }`}
                    >
                      <Users size={24} className={registerAccountType === 'team' ? 'text-accent-primary' : 'text-gray-400'} />
                      <span className={`text-xs font-medium ${registerAccountType === 'team' ? 'text-accent-primary' : 'text-gray-600 dark:text-gray-400'}`}>
                        Team
                      </span>
                    </button>
                  </div>
                </div>

                {/* Organization Name - only for business/team */}
                {(registerAccountType === 'business' || registerAccountType === 'team') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      {registerAccountType === 'business' ? 'Firmenname' : 'Team-Name'} *
                    </label>
                    <div className="relative">
                      <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                      <input
                        type="text"
                        value={registerOrganizationName}
                        onChange={(e) => setRegisterOrganizationName(e.target.value)}
                        placeholder={registerAccountType === 'business' ? 'z.B. Musterfirma GmbH' : 'z.B. Design Team Alpha'}
                        className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Benutzername *
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                    <input
                      type="text"
                      value={registerUsername}
                      onChange={(e) => setRegisterUsername(e.target.value)}
                      placeholder="3-20 Zeichen, nur a-z, 0-9, _, -"
                      className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                      autoFocus={registerAccountType === 'personal'}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    E-Mail-Adresse *
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                    <input
                      type="email"
                      value={registerEmail}
                      onChange={(e) => setRegisterEmail(e.target.value)}
                      placeholder="deine@email.de"
                      className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Passwort *
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                    <input
                      type="password"
                      value={registerPassword}
                      onChange={(e) => setRegisterPassword(e.target.value)}
                      placeholder="Min. 8 Zeichen, Groß-/Kleinbuchstaben, Zahl"
                      className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Passwort bestätigen *
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                    <input
                      type="password"
                      value={registerPasswordConfirm}
                      onChange={(e) => setRegisterPasswordConfirm(e.target.value)}
                      placeholder="Passwort wiederholen"
                      className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                </div>

                {/* Invite Code - Optional */}
                <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Ticket size={18} className="text-gray-500 dark:text-gray-400" />
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Einladungscode (optional)
                    </label>
                  </div>
                  <input
                    type="text"
                    value={registerInviteCode}
                    onChange={(e) => setRegisterInviteCode(e.target.value.toUpperCase())}
                    placeholder="INVITE-XXXXXXXXX"
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    💡 Du hast einen Einladungscode? Gib ihn hier ein, um einem bestehenden Team beizutreten
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 btn-accent"
                >
                  {isLoading ? 'Registrieren...' : 'Registrieren'}
                </button>

                <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                  Mit der Registrierung akzeptierst du unsere Datenschutzbestimmungen
                </p>
              </form>
            )}
          </div>
        </div>

        {/* Footer Note */}
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            🔐 Sicher verschlüsselt • MFA-ready • Multi-User Support
          </p>
        </div>
      </div>
    </div>
  );
};
