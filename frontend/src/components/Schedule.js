import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { 
  Plus, 
  Calendar, 
  Clock,
  Trash2,
  X,
  Check
} from 'lucide-react';

const DaySelector = ({ selected, onChange, language }) => {
  const days = language === 'da' 
    ? [
        { key: 'mon', label: 'Man' },
        { key: 'tue', label: 'Tir' },
        { key: 'wed', label: 'Ons' },
        { key: 'thu', label: 'Tor' },
        { key: 'fri', label: 'Fre' },
        { key: 'sat', label: 'Lør' },
        { key: 'sun', label: 'Søn' }
      ]
    : [
        { key: 'mon', label: 'Mon' },
        { key: 'tue', label: 'Tue' },
        { key: 'wed', label: 'Wed' },
        { key: 'thu', label: 'Thu' },
        { key: 'fri', label: 'Fri' },
        { key: 'sat', label: 'Sat' },
        { key: 'sun', label: 'Sun' }
      ];
  
  const toggle = (key) => {
    if (selected.includes(key)) {
      onChange(selected.filter(d => d !== key));
    } else {
      onChange([...selected, key]);
    }
  };
  
  return (
    <div className="flex gap-2 flex-wrap">
      {days.map(day => (
        <button
          key={day.key}
          type="button"
          onClick={() => toggle(day.key)}
          className={`day-chip ${selected.includes(day.key) ? 'selected' : ''}`}
          data-testid={`day-chip-${day.key}`}
        >
          {day.label}
        </button>
      ))}
    </div>
  );
};

export const Schedule = () => {
  const { t, language, medicines, timeSlots, schedule, addScheduleEntry, deleteScheduleEntry, loading } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    medicine_id: '',
    slot_id: '',
    days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
    pills_whole: 1,
    pills_half: 0
  });
  
  const resetForm = () => {
    setFormData({
      medicine_id: '',
      slot_id: '',
      days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      pills_whole: 1,
      pills_half: 0
    });
    setShowForm(false);
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await addScheduleEntry(formData);
      resetForm();
    } catch (err) {
      console.error(err);
    }
  };
  
  const handleDelete = async (entryId) => {
    try {
      await deleteScheduleEntry(entryId);
    } catch (err) {
      console.error(err);
    }
  };
  
  // Group schedule by time slot
  const groupedSchedule = timeSlots.map(slot => ({
    ...slot,
    entries: schedule.filter(s => s.slot_id === slot.slot_id)
  })).filter(slot => slot.entries.length > 0);
  
  const getDayLabels = (days) => {
    const dayMap = language === 'da' 
      ? { mon: 'Man', tue: 'Tir', wed: 'Ons', thu: 'Tor', fri: 'Fre', sat: 'Lør', sun: 'Søn' }
      : { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
    
    if (days.length === 7) return language === 'da' ? 'Hver dag' : 'Every day';
    if (days.length === 5 && !days.includes('sat') && !days.includes('sun')) {
      return language === 'da' ? 'Hverdage' : 'Weekdays';
    }
    return days.map(d => dayMap[d]).join(', ');
  };
  
  const formatPillsDose = (entry) => {
    const whole = entry.pills_whole || 0;
    const half = entry.pills_half || 0;
    const parts = [];
    if (whole > 0) parts.push(`${whole} ${language === 'da' ? 'hel' : 'whole'}${whole > 1 ? (language === 'da' ? 'e' : '') : ''}`);
    if (half > 0) parts.push(`${half} ${language === 'da' ? 'halv' : 'half'}${half > 1 ? (language === 'da' ? 'e' : '') : ''}`);
    return parts.join(' + ') || '1';
  };
  
  return (
    <div className="p-4 pb-24 max-w-2xl mx-auto animate-fade-in" data-testid="schedule-page">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">{t('weeklySchedule')}</h1>
        <button 
          onClick={() => setShowForm(true)}
          className="btn-primary"
          disabled={medicines.length === 0}
          data-testid="add-schedule-btn"
        >
          <Plus className="w-5 h-5" />
          {t('add')}
        </button>
      </div>
      
      {/* Schedule List */}
      {groupedSchedule.length === 0 ? (
        <div className="glass-card p-8 text-center" data-testid="no-schedule-msg">
          <Calendar className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
          <p className="text-zinc-400 mb-4">{t('noSchedule')}</p>
          {medicines.length === 0 ? (
            <p className="text-zinc-500 text-sm">{t('noMedicines')}</p>
          ) : (
            <button 
              onClick={() => setShowForm(true)}
              className="btn-primary"
            >
              <Plus className="w-5 h-5" />
              {t('addToSchedule')}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {groupedSchedule.map(slot => (
            <div key={slot.slot_id} className="glass-card p-4" data-testid={`schedule-slot-${slot.slot_id}`}>
              <div className="flex items-center gap-3 mb-4 pb-4 border-b border-zinc-800">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <h3 className="font-semibold">{slot.name}</h3>
                  <p className="text-sm text-zinc-400">{slot.time}</p>
                </div>
              </div>
              
              <div className="space-y-3">
                {slot.entries.map(entry => (
                  <div 
                    key={entry.entry_id}
                    className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-xl"
                    data-testid={`schedule-entry-${entry.entry_id}`}
                  >
                    <div>
                      <p className="font-medium">{entry.medicine_name}</p>
                      <p className="text-sm text-zinc-400">
                        {formatPillsDose(entry)} • {getDayLabels(entry.days)}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDelete(entry.entry_id)}
                      className="p-2 hover:bg-zinc-700 rounded-lg transition-colors text-zinc-400 hover:text-red-400"
                      data-testid={`delete-schedule-${entry.entry_id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* Time Slots Overview */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold mb-4">{t('timeSlots')}</h2>
        <div className="grid grid-cols-2 gap-3">
          {timeSlots.map(slot => (
            <div 
              key={slot.slot_id}
              className="glass-card p-4 flex items-center gap-3"
              data-testid={`timeslot-${slot.slot_id}`}
            >
              <Clock className="w-5 h-5 text-zinc-400" />
              <div>
                <p className="font-medium">{slot.name}</p>
                <p className="text-sm text-zinc-400">{slot.time}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      
      {/* Add Schedule Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50" data-testid="schedule-form-modal">
          <div className="glass-card w-full max-w-md p-6 animate-fade-in">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold">{t('addToSchedule')}</h2>
              <button
                onClick={resetForm}
                className="p-2 hover:bg-zinc-700 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-zinc-400 mb-2">{t('selectMedicine')}</label>
                <select
                  value={formData.medicine_id}
                  onChange={e => setFormData(prev => ({ ...prev, medicine_id: e.target.value }))}
                  className="select-field"
                  required
                  data-testid="select-medicine"
                >
                  <option value="">{t('selectMedicine')}...</option>
                  {medicines.map(med => (
                    <option key={med.medicine_id} value={med.medicine_id}>
                      {med.name} ({med.dosage})
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm text-zinc-400 mb-2">{t('selectTimeSlot')}</label>
                <select
                  value={formData.slot_id}
                  onChange={e => setFormData(prev => ({ ...prev, slot_id: e.target.value }))}
                  className="select-field"
                  required
                  data-testid="select-timeslot"
                >
                  <option value="">{t('selectTimeSlot')}...</option>
                  {timeSlots.map(slot => (
                    <option key={slot.slot_id} value={slot.slot_id}>
                      {slot.name} ({slot.time})
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm text-zinc-400 mb-2">{t('selectDays')}</label>
                <DaySelector 
                  selected={formData.days} 
                  onChange={days => setFormData(prev => ({ ...prev, days }))}
                  language={language}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-zinc-400 mb-2">{t('pillsWhole')}</label>
                  <input
                    type="number"
                    value={formData.pills_whole}
                    onChange={e => setFormData(prev => ({ ...prev, pills_whole: parseInt(e.target.value) || 0 }))}
                    className="input-field"
                    min="0"
                    data-testid="pills-whole-input"
                  />
                </div>
                <div>
                  <label className="block text-sm text-zinc-400 mb-2">{t('pillsHalf')}</label>
                  <input
                    type="number"
                    value={formData.pills_half}
                    onChange={e => setFormData(prev => ({ ...prev, pills_half: parseInt(e.target.value) || 0 }))}
                    className="input-field"
                    min="0"
                    data-testid="pills-half-input"
                  />
                </div>
              </div>
              
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={resetForm}
                  className="btn-secondary flex-1"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  disabled={loading || !formData.medicine_id || !formData.slot_id || formData.days.length === 0}
                  className="btn-primary flex-1"
                  data-testid="save-schedule-btn"
                >
                  {loading ? t('loading') : t('save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
