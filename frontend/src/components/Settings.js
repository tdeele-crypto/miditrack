import React from 'react';
import { useApp } from '../context/AppContext';
import { 
  User, 
  Globe, 
  LogOut,
  ChevronRight,
  Mail
} from 'lucide-react';

export const Settings = () => {
  const { t, user, language, updateLanguage, logout } = useApp();
  
  const handleLanguageChange = (lang) => {
    updateLanguage(lang);
  };
  
  const handleLogout = () => {
    logout();
  };
  
  return (
    <div className="p-4 pb-24 max-w-2xl mx-auto animate-fade-in" data-testid="settings-page">
      {/* Header */}
      <h1 className="text-2xl font-bold mb-6">{t('settings')}</h1>
      
      {/* Profile Section */}
      <div className="glass-card p-4 mb-6" data-testid="profile-section">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <User className="w-5 h-5 text-emerald-400" />
          {t('profile')}
        </h2>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <User className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-sm text-zinc-400">{t('name')}</p>
                <p className="font-medium">{user?.name}</p>
              </div>
            </div>
          </div>
          
          <div className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                <Mail className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-zinc-400">{t('email')}</p>
                <p className="font-medium">{user?.email}</p>
              </div>
            </div>
          </div>
          
          <div className="p-3 bg-zinc-800/50 rounded-xl">
            <p className="text-sm text-zinc-400 mb-1">User ID</p>
            <p className="font-mono text-sm text-zinc-300 break-all">{user?.user_id}</p>
          </div>
        </div>
      </div>
      
      {/* Language Section */}
      <div className="glass-card p-4 mb-6" data-testid="language-section">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Globe className="w-5 h-5 text-emerald-400" />
          {t('language')}
        </h2>
        
        <div className="space-y-2">
          <button
            onClick={() => handleLanguageChange('da')}
            className={`w-full flex items-center justify-between p-4 rounded-xl transition-all ${
              language === 'da' 
                ? 'bg-emerald-500/20 border border-emerald-500/30' 
                : 'bg-zinc-800/50 hover:bg-zinc-800'
            }`}
            data-testid="lang-da-btn"
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">🇩🇰</span>
              <span className="font-medium">{t('danish')}</span>
            </div>
            {language === 'da' && (
              <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center">
                <ChevronRight className="w-4 h-4 text-white" />
              </div>
            )}
          </button>
          
          <button
            onClick={() => handleLanguageChange('en')}
            className={`w-full flex items-center justify-between p-4 rounded-xl transition-all ${
              language === 'en' 
                ? 'bg-emerald-500/20 border border-emerald-500/30' 
                : 'bg-zinc-800/50 hover:bg-zinc-800'
            }`}
            data-testid="lang-en-btn"
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">🇬🇧</span>
              <span className="font-medium">{t('english')}</span>
            </div>
            {language === 'en' && (
              <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center">
                <ChevronRight className="w-4 h-4 text-white" />
              </div>
            )}
          </button>
        </div>
      </div>
      
      {/* Logout */}
      <button
        onClick={handleLogout}
        className="w-full flex items-center justify-center gap-2 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 hover:bg-red-500/20 transition-all"
        data-testid="logout-btn"
      >
        <LogOut className="w-5 h-5" />
        {t('logout')}
      </button>
    </div>
  );
};
