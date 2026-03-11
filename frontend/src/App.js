import React, { useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { AuthScreen } from './components/AuthScreen';
import { Dashboard } from './components/Dashboard';
import { Medicines } from './components/Medicines';
import { Schedule } from './components/Schedule';
import { Settings } from './components/Settings';
import { Navigation } from './components/Navigation';
import './App.css';

const AppContent = () => {
  const { user } = useApp();
  const [currentPage, setCurrentPage] = useState('dashboard');
  
  if (!user) {
    return <AuthScreen />;
  }
  
  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard />;
      case 'medicines':
        return <Medicines />;
      case 'schedule':
        return <Schedule />;
      case 'settings':
        return <Settings />;
      default:
        return <Dashboard />;
    }
  };
  
  return (
    <div className="min-h-screen bg-[#0a0a0f]" data-testid="app-container">
      {renderPage()}
      <Navigation currentPage={currentPage} onNavigate={setCurrentPage} />
    </div>
  );
};

function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}

export default App;
