import { useState } from 'react';
import { Clock, Mail, Lock, User, Shield, Building2, Users, Ticket } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { AccountType } from '../types';

export const Auth = () => {
  const { login, register } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

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
      password: loginPassword,
      mfaCode: loginMfaCode || undefined
    });

    if (!result.success) {
      setError(result.message || 'Login fehlgeschlagen');
    }

    setIsLoading(false);
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo/Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-full mb-4">
            <Clock className="text-white" size={32} />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Time Tracking
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Professionelle Zeiterfassung
          </p>
        </div>

        {/* Auth Card */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-gray-200 dark:border-gray-700">
            <button
              onClick={() => {
                setIsLogin(true);
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
                setIsLogin(false);
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
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Passwort
                  </label>
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

                {/* MFA Code (future) */}
                <div className="border border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-2">
                    <Shield size={16} />
                    <span className="text-xs font-medium">MFA (in Vorbereitung)</span>
                  </div>
                  <input
                    type="text"
                    value={loginMfaCode}
                    onChange={(e) => setLoginMfaCode(e.target.value)}
                    placeholder="6-stelliger Code (optional)"
                    maxLength={6}
                    disabled
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800 dark:text-gray-400 text-sm opacity-50 cursor-not-allowed"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 btn-accent"
                >
                  {isLoading ? 'Anmelden...' : 'Anmelden'}
                </button>
              </form>
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
