import React from 'react';
import { useApp } from '../context/AppContext';
import { 
  LayoutDashboard, 
  Pill, 
  Calendar, 
  Settings as SettingsIcon 
} from 'lucide-react';

export const Navigation = ({ currentPage, onNavigate }) => {
  const { t } = useApp();
  
  const navItems = [
    { id: 'dashboard', icon: LayoutDashboard, label: t('dashboard') },
    { id: 'medicines', icon: Pill, label: t('medicines') },
    { id: 'schedule', icon: Calendar, label: t('schedule') },
    { id: 'settings', icon: SettingsIcon, label: t('settings') }
  ];
  
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-[#12121a]/95 backdrop-blur-lg border-t border-zinc-800 safe-area-inset-bottom" data-testid="navigation">
      <div className="max-w-2xl mx-auto flex justify-around py-2">
        {navItems.map(item => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;
          
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`nav-item ${isActive ? 'active' : ''}`}
              data-testid={`nav-${item.id}`}
            >
              <Icon className="w-6 h-6" />
              <span className="text-xs">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
