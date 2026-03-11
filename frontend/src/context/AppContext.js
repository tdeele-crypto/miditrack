import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { getTranslation } from '../i18n/translations';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const AppContext = createContext(null);

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
};

export const AppProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [language, setLanguage] = useState('da');
  const [medicines, setMedicines] = useState([]);
  const [timeSlots, setTimeSlots] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const t = useCallback((key) => getTranslation(language, key), [language]);

  // Load user from localStorage
  useEffect(() => {
    const savedUser = localStorage.getItem('meditrack_user');
    const savedLang = localStorage.getItem('meditrack_language');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
    if (savedLang) {
      setLanguage(savedLang);
    }
  }, []);

  // Auth functions
  const register = async (pin, name, email) => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.post(`${API_URL}/api/auth/register`, { pin, name, email });
      const userData = res.data;
      setUser(userData);
      localStorage.setItem('meditrack_user', JSON.stringify(userData));
      return userData;
    } catch (err) {
      setError(err.response?.data?.detail || 'Registration failed');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const login = async (userId, pin) => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.post(`${API_URL}/api/auth/login`, { user_id: userId, pin });
      const userData = {
        user_id: res.data.user_id,
        name: res.data.name,
        email: res.data.email,
        language: res.data.language
      };
      setUser(userData);
      setLanguage(res.data.language || 'da');
      localStorage.setItem('meditrack_user', JSON.stringify(userData));
      localStorage.setItem('meditrack_language', res.data.language || 'da');
      saveKnownUser(userData);
      return userData;
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const loginByEmail = async (email, pin) => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.post(`${API_URL}/api/auth/login-email`, { email, pin });
      const userData = {
        user_id: res.data.user_id,
        name: res.data.name,
        email: res.data.email,
        language: res.data.language
      };
      setUser(userData);
      setLanguage(res.data.language || 'da');
      localStorage.setItem('meditrack_user', JSON.stringify(userData));
      localStorage.setItem('meditrack_language', res.data.language || 'da');
      return userData;
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const saveKnownUser = (userData) => {
    const known = JSON.parse(localStorage.getItem('meditrack_known_users') || '[]');
    const exists = known.findIndex(u => u.user_id === userData.user_id);
    if (exists >= 0) {
      known[exists] = { user_id: userData.user_id, name: userData.name, email: userData.email };
    } else {
      known.push({ user_id: userData.user_id, name: userData.name, email: userData.email });
    }
    localStorage.setItem('meditrack_known_users', JSON.stringify(known));
  };

  const removeKnownUser = (userId) => {
    const known = JSON.parse(localStorage.getItem('meditrack_known_users') || '[]');
    const filtered = known.filter(u => u.user_id !== userId);
    localStorage.setItem('meditrack_known_users', JSON.stringify(filtered));
  };

  const logout = () => {
    setUser(null);
    setMedicines([]);
    setTimeSlots([]);
    setSchedule([]);
    localStorage.removeItem('meditrack_user');
  };

  const requestPinReset = async (email) => {
    setLoading(true);
    try {
      const res = await axios.post(`${API_URL}/api/auth/request-pin-reset`, { email });
      return res.data;
    } catch (err) {
      setError(err.response?.data?.detail || 'Reset request failed');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const confirmPinReset = async (email, resetCode, newPin) => {
    setLoading(true);
    try {
      const res = await axios.post(`${API_URL}/api/auth/confirm-pin-reset`, {
        email,
        reset_code: resetCode,
        new_pin: newPin
      });
      return res.data;
    } catch (err) {
      setError(err.response?.data?.detail || 'Reset failed');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const updateLanguage = async (lang) => {
    if (user) {
      try {
        await axios.put(`${API_URL}/api/auth/user/${user.user_id}/language`, { language: lang });
      } catch (err) {
        console.error('Failed to update language on server');
      }
    }
    setLanguage(lang);
    localStorage.setItem('meditrack_language', lang);
  };

  // Medicine functions
  const fetchMedicines = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/api/medicines/${user.user_id}`);
      setMedicines(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to fetch medicines');
    } finally {
      setLoading(false);
    }
  }, [user]);

  const addMedicine = async (medicine) => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await axios.post(`${API_URL}/api/medicines/${user.user_id}`, medicine);
      setMedicines(prev => [...prev, res.data]);
      return res.data;
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to add medicine');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const updateMedicine = async (medicineId, updates) => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await axios.put(`${API_URL}/api/medicines/${user.user_id}/${medicineId}`, updates);
      setMedicines(prev => prev.map(m => m.medicine_id === medicineId ? res.data : m));
      return res.data;
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update medicine');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const deleteMedicine = async (medicineId) => {
    if (!user) return;
    setLoading(true);
    try {
      await axios.delete(`${API_URL}/api/medicines/${user.user_id}/${medicineId}`);
      setMedicines(prev => prev.filter(m => m.medicine_id !== medicineId));
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to delete medicine');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Time slots functions
  const fetchTimeSlots = useCallback(async () => {
    if (!user) return;
    try {
      const res = await axios.get(`${API_URL}/api/timeslots/${user.user_id}`);
      setTimeSlots(res.data);
    } catch (err) {
      console.error('Failed to fetch time slots');
    }
  }, [user]);

  const updateTimeSlot = async (slotId, data) => {
    if (!user) return;
    try {
      await axios.put(`${API_URL}/api/timeslots/${user.user_id}/${slotId}`, data);
      await fetchTimeSlots();
    } catch (err) {
      console.error('Failed to update time slot');
    }
  };

  // Schedule functions
  const fetchSchedule = useCallback(async () => {
    if (!user) return;
    try {
      const res = await axios.get(`${API_URL}/api/schedule/${user.user_id}`);
      setSchedule(res.data);
    } catch (err) {
      console.error('Failed to fetch schedule');
    }
  }, [user]);

  const addScheduleEntry = async (entry) => {
    if (!user) return;
    try {
      const res = await axios.post(`${API_URL}/api/schedule/${user.user_id}`, {
        medicine_id: entry.medicine_id,
        slot_id: entry.slot_id,
        day_doses: entry.day_doses || {},
        special_ordination: entry.special_ordination || null
      });
      await fetchSchedule();
      await fetchMedicines();
      return res.data;
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to add schedule');
      throw err;
    }
  };

  const deleteScheduleEntry = async (entryId) => {
    if (!user) return;
    try {
      await axios.delete(`${API_URL}/api/schedule/${user.user_id}/${entryId}`);
      setSchedule(prev => prev.filter(s => s.entry_id !== entryId));
      await fetchMedicines();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to delete schedule');
      throw err;
    }
  };

  const updateScheduleEntry = async (entryId, updates) => {
    if (!user) return;
    try {
      const res = await axios.put(`${API_URL}/api/schedule/${user.user_id}/${entryId}`, updates);
      await fetchSchedule();
      await fetchMedicines();
      return res.data;
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update schedule');
      throw err;
    }
  };

  // Load data when user logs in
  useEffect(() => {
    if (user) {
      fetchMedicines();
      fetchTimeSlots();
      fetchSchedule();
    }
  }, [user, fetchMedicines, fetchTimeSlots, fetchSchedule]);

  const value = {
    user,
    language,
    medicines,
    timeSlots,
    schedule,
    loading,
    error,
    setError,
    t,
    register,
    login,
    loginByEmail,
    saveKnownUser,
    removeKnownUser,
    logout,
    requestPinReset,
    confirmPinReset,
    updateLanguage,
    fetchMedicines,
    addMedicine,
    updateMedicine,
    deleteMedicine,
    fetchTimeSlots,
    updateTimeSlot,
    fetchSchedule,
    addScheduleEntry,
    deleteScheduleEntry,
    updateScheduleEntry
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
