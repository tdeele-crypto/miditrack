import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Pill, Mail, ArrowLeft, User, KeyRound, Users, X, Plus } from 'lucide-react';

const PinInput = ({ value, onChange, error, disabled, autoFocus }) => {
  const inputs = useRef([]);
  
  useEffect(() => {
    if (autoFocus) {
      inputs.current[0]?.focus();
    }
  }, [autoFocus]);
  
  const handleChange = (index, e) => {
    const val = e.target.value.replace(/\D/g, '');
    if (val.length <= 1) {
      const newPin = value.split('');
      newPin[index] = val;
      onChange(newPin.join(''));
      
      if (val && index < 3) {
        inputs.current[index + 1]?.focus();
      }
    }
  };
  
  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !value[index] && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  };
  
  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
    onChange(pasted);
    if (pasted.length === 4) {
      inputs.current[3]?.focus();
    }
  };
  
  return (
    <div className="flex gap-3 justify-center">
      {[0, 1, 2, 3].map(i => (
        <input
          key={i}
          ref={el => inputs.current[i] = el}
          type="password"
          inputMode="numeric"
          maxLength={1}
          value={value[i] || ''}
          onChange={e => handleChange(i, e)}
          onKeyDown={e => handleKeyDown(i, e)}
          onPaste={handlePaste}
          disabled={disabled}
          className={`pin-input ${error ? 'error' : ''}`}
          data-testid={`pin-input-${i}`}
        />
      ))}
    </div>
  );
};

export const AuthScreen = () => {
  const { t, register, loginByEmail, removeKnownUser, loading, error, setError } = useApp();
  const [mode, setMode] = useState('welcome');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [pinError, setPinError] = useState('');
  const [knownUsers, setKnownUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const { requestPinReset, confirmPinReset } = useApp();
  
  useEffect(() => {
    loadKnownUsers();
  }, []);
  
  const loadKnownUsers = () => {
    const known = JSON.parse(localStorage.getItem('meditrack_known_users') || '[]');
    setKnownUsers(known);
  };
  
  const handleRegister = async (e) => {
    e.preventDefault();
    setPinError('');
    
    if (pin.length !== 4) {
      setPinError(t('pinMustBe4'));
      return;
    }
    if (pin !== confirmPin) {
      setPinError(t('pinsDontMatch'));
      return;
    }
    
    try {
      await register(pin, name, email);
    } catch (err) {
      // Error handled by context
    }
  };
  
  const handleLoginSelected = async (e) => {
    e.preventDefault();
    setPinError('');
    
    if (pin.length !== 4) {
      setPinError(t('pinMustBe4'));
      return;
    }
    
    const loginEmail = selectedUser?.email || email;
    try {
      await loginByEmail(loginEmail, pin);
    } catch (err) {
      setPinError(t('error'));
    }
  };
  
  const handleRequestReset = async (e) => {
    e.preventDefault();
    try {
      await requestPinReset(email);
      setMode('reset');
    } catch (err) {
      // Error handled by context
    }
  };
  
  const handleConfirmReset = async (e) => {
    e.preventDefault();
    if (pin.length !== 4) {
      setPinError(t('pinMustBe4'));
      return;
    }
    
    try {
      await confirmPinReset(email, resetCode, pin);
      setMode('welcome');
      setPin('');
      loadKnownUsers();
    } catch (err) {
      // Error handled by context
    }
  };
  
  const handleRemoveUser = (userId, e) => {
    e.stopPropagation();
    removeKnownUser(userId);
    loadKnownUsers();
  };
  
  const resetForm = () => {
    setPin('');
    setConfirmPin('');
    setResetCode('');
    setPinError('');
    setError(null);
    setSelectedUser(null);
  };
  
  const goToMode = (newMode) => {
    resetForm();
    setMode(newMode);
  };
  
  const selectUserForLogin = (user) => {
    resetForm();
    setSelectedUser(user);
    setEmail(user.email);
    setMode('pin-login');
  };
  
  return (
    <div className="min-h-screen flex items-center justify-center p-4" data-testid="auth-screen">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8 animate-fade-in">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 mb-4">
            <Pill className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">{t('appName')}</h1>
        </div>
        
        {/* Welcome Screen - User Switcher */}
        {mode === 'welcome' && (
          <div className="glass-card p-8 animate-fade-in" data-testid="welcome-screen">
            <h2 className="text-xl font-semibold text-center mb-6">{t('welcome')}</h2>
            
            {knownUsers.length > 0 && (
              <div className="mb-6">
                <p className="text-sm text-zinc-400 mb-3">{t('knownAccounts')}</p>
                <div className="space-y-2">
                  {knownUsers.map(u => (
                    <button
                      key={u.user_id}
                      onClick={() => selectUserForLogin(u)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl bg-zinc-800/50 hover:bg-zinc-700/50 border border-zinc-700/50 hover:border-emerald-500/40 transition-all group"
                      data-testid={`user-select-${u.email}`}
                    >
                      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 shrink-0">
                        <User className="w-5 h-5" />
                      </div>
                      <div className="flex-1 text-left min-w-0">
                        <div className="text-white font-medium truncate">{u.name}</div>
                        <div className="text-xs text-zinc-400 truncate">{u.email}</div>
                      </div>
                      <button
                        onClick={(e) => handleRemoveUser(u.user_id, e)}
                        className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-500/20 text-zinc-500 hover:text-red-400 transition-all"
                        data-testid={`remove-user-${u.email}`}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </button>
                  ))}
                </div>
              </div>
            )}
            
            <button
              onClick={() => goToMode('email-login')}
              className="btn-secondary w-full mb-3"
              data-testid="email-login-btn"
            >
              <Mail className="w-5 h-5" />
              {t('loginWithEmail')}
            </button>
            
            <button
              onClick={() => goToMode('register')}
              className="btn-primary w-full"
              data-testid="register-btn"
            >
              <Plus className="w-5 h-5" />
              {t('createAccount')}
            </button>
          </div>
        )}
        
        {/* PIN Login for selected user */}
        {mode === 'pin-login' && selectedUser && (
          <form onSubmit={handleLoginSelected} className="glass-card p-8 animate-fade-in" data-testid="pin-login-form">
            <button
              type="button"
              onClick={() => goToMode('welcome')}
              className="flex items-center gap-2 text-zinc-400 hover:text-white mb-6 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              {t('switchUser')}
            </button>
            
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 mb-3">
                <User className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-semibold text-white">{selectedUser.name}</h2>
              <p className="text-sm text-zinc-400">{selectedUser.email}</p>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-zinc-400 mb-3 text-center">{t('enterPin')}</label>
                <PinInput value={pin} onChange={setPin} error={pinError} disabled={loading} autoFocus />
              </div>
              
              {(pinError || error) && (
                <p className="text-red-400 text-sm text-center" data-testid="login-error">{pinError || error}</p>
              )}
              
              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full mt-6"
                data-testid="submit-login-btn"
              >
                {loading ? t('loading') : t('login')}
              </button>
              
              <button
                type="button"
                onClick={() => { setEmail(selectedUser.email); goToMode('forgot'); }}
                className="w-full text-center text-zinc-400 hover:text-emerald-400 transition-colors mt-2 text-sm"
                data-testid="forgot-pin-btn"
              >
                {t('forgotPin')}
              </button>
            </div>
          </form>
        )}
        
        {/* Email Login Screen */}
        {mode === 'email-login' && (
          <form onSubmit={handleLoginSelected} className="glass-card p-8 animate-fade-in" data-testid="email-login-form">
            <button
              type="button"
              onClick={() => goToMode('welcome')}
              className="flex items-center gap-2 text-zinc-400 hover:text-white mb-6 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              {t('back')}
            </button>
            
            <h2 className="text-xl font-semibold mb-6">{t('loginWithEmail')}</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-zinc-400 mb-2">{t('email')}</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="input-field"
                  required
                  data-testid="login-email-input"
                />
              </div>
              
              <div>
                <label className="block text-sm text-zinc-400 mb-2">{t('enterPin')}</label>
                <PinInput value={pin} onChange={setPin} error={pinError} disabled={loading} />
              </div>
              
              {(pinError || error) && (
                <p className="text-red-400 text-sm text-center" data-testid="login-error">{pinError || error}</p>
              )}
              
              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full mt-6"
                data-testid="submit-email-login-btn"
              >
                {loading ? t('loading') : t('login')}
              </button>
              
              <button
                type="button"
                onClick={() => goToMode('forgot')}
                className="w-full text-center text-zinc-400 hover:text-emerald-400 transition-colors mt-2 text-sm"
                data-testid="forgot-pin-btn"
              >
                {t('forgotPin')}
              </button>
            </div>
          </form>
        )}
        
        {/* Register Screen */}
        {mode === 'register' && (
          <form onSubmit={handleRegister} className="glass-card p-8 animate-fade-in" data-testid="register-form">
            <button
              type="button"
              onClick={() => goToMode('welcome')}
              className="flex items-center gap-2 text-zinc-400 hover:text-white mb-6 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              {t('back')}
            </button>
            
            <h2 className="text-xl font-semibold mb-6">{t('createAccount')}</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-zinc-400 mb-2">{t('name')}</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="input-field"
                  required
                  data-testid="name-input"
                />
              </div>
              
              <div>
                <label className="block text-sm text-zinc-400 mb-2">{t('email')}</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="input-field"
                  required
                  data-testid="email-input"
                />
              </div>
              
              <div>
                <label className="block text-sm text-zinc-400 mb-2">{t('pin')}</label>
                <PinInput value={pin} onChange={setPin} error={pinError} disabled={loading} />
              </div>
              
              <div>
                <label className="block text-sm text-zinc-400 mb-2">{t('confirmPin')}</label>
                <PinInput value={confirmPin} onChange={setConfirmPin} error={pinError} disabled={loading} />
              </div>
              
              {(pinError || error) && (
                <p className="text-red-400 text-sm text-center">{pinError || error}</p>
              )}
              
              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full mt-6"
                data-testid="submit-register-btn"
              >
                {loading ? t('loading') : t('createAccount')}
              </button>
            </div>
          </form>
        )}
        
        {/* Forgot PIN Screen */}
        {mode === 'forgot' && (
          <form onSubmit={handleRequestReset} className="glass-card p-8 animate-fade-in" data-testid="forgot-form">
            <button
              type="button"
              onClick={() => goToMode('welcome')}
              className="flex items-center gap-2 text-zinc-400 hover:text-white mb-6 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              {t('back')}
            </button>
            
            <h2 className="text-xl font-semibold mb-6">{t('resetPin')}</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-zinc-400 mb-2">{t('email')}</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="input-field pl-12"
                    required
                    data-testid="reset-email-input"
                  />
                </div>
              </div>
              
              {error && (
                <p className="text-red-400 text-sm text-center">{error}</p>
              )}
              
              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full mt-6"
                data-testid="send-reset-btn"
              >
                {loading ? t('loading') : t('sendResetCode')}
              </button>
            </div>
          </form>
        )}
        
        {/* Reset PIN Screen */}
        {mode === 'reset' && (
          <form onSubmit={handleConfirmReset} className="glass-card p-8 animate-fade-in" data-testid="reset-form">
            <button
              type="button"
              onClick={() => goToMode('forgot')}
              className="flex items-center gap-2 text-zinc-400 hover:text-white mb-6 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              {t('back')}
            </button>
            
            <h2 className="text-xl font-semibold mb-6">{t('resetPin')}</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-zinc-400 mb-2">{t('enterResetCode')}</label>
                <input
                  type="text"
                  value={resetCode}
                  onChange={e => setResetCode(e.target.value.toUpperCase())}
                  className="input-field text-center tracking-widest font-mono"
                  maxLength={6}
                  required
                  data-testid="reset-code-input"
                />
              </div>
              
              <div>
                <label className="block text-sm text-zinc-400 mb-2">{t('newPin')}</label>
                <PinInput value={pin} onChange={setPin} error={pinError} disabled={loading} />
              </div>
              
              {(pinError || error) && (
                <p className="text-red-400 text-sm text-center">{pinError || error}</p>
              )}
              
              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full mt-6"
                data-testid="confirm-reset-btn"
              >
                {loading ? t('loading') : t('confirmReset')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
