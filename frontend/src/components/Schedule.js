import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { 
  Plus, 
  Calendar, 
  Clock,
  Trash2,
  X,
  Edit3
} from 'lucide-react';

const DAYS = [
  { key: 'mon', da: 'Man', en: 'Mon' },
  { key: 'tue', da: 'Tir', en: 'Tue' },
  { key: 'wed', da: 'Ons', en: 'Wed' },
  { key: 'thu', da: 'Tor', en: 'Thu' },
  { key: 'fri', da: 'Fre', en: 'Fri' },
  { key: 'sat', da: 'Lør', en: 'Sat' },
  { key: 'sun', da: 'Søn', en: 'Sun' }
];

const EditableTimeSlot = ({ slot, onSave }) => {
  const [showModal, setShowModal] = useState(false);
  const [time, setTime] = useState(slot.time);
  
  const openModal = () => {
    setTime(slot.time);
    setShowModal(true);
  };
  
  const save = () => {
    if (time !== slot.time) {
      onSave(slot, time);
    }
    setShowModal(false);
  };
  
  return (
    <>
      <div 
        className="glass-card p-4 flex items-center gap-3 cursor-pointer hover:border-emerald-500/40 transition-all"
        onClick={openModal}
        data-testid={`timeslot-${slot.slot_id}`}
      >
        <Clock className="w-5 h-5 text-emerald-400 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">{slot.name}</p>
          <p className="text-sm text-zinc-400">{slot.time}</p>
        </div>
      </div>
      
      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50" onClick={() => setShowModal(false)}>
          <div className="glass-card w-full max-w-xs p-6 animate-fade-in" onClick={e => e.stopPropagation()} data-testid={`timeslot-modal-${slot.slot_id}`}>
            <h3 className="text-lg font-semibold mb-1">{slot.name}</h3>
            <p className="text-sm text-zinc-400 mb-4">Rediger tidspunkt</p>
            <input
              type="time"
              value={time}
              onChange={e => setTime(e.target.value)}
              className="input-field w-full text-center text-xl py-3 mb-4"
              autoFocus
              data-testid={`timeslot-input-${slot.slot_id}`}
            />
            <div className="flex gap-3">
              <button onClick={() => setShowModal(false)} className="btn-secondary flex-1">Annuller</button>
              <button onClick={save} className="btn-primary flex-1" data-testid={`timeslot-save-${slot.slot_id}`}>Gem</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

const DayDoseSelector = ({ dayDoses, onChange, language, medicineDosage }) => {
  const extractMg = (dosageStr) => {
    if (!dosageStr) return null;
    const match = dosageStr.match(/(\d+(?:[.,]\d+)?)\s*(mg|g|mcg|µg)/i);
    if (!match) return null;
    let value = parseFloat(match[1].replace(',', '.'));
    const unit = match[2].toLowerCase();
    if (unit === 'g') value *= 1000;
    if (unit === 'mcg' || unit === 'µg') value /= 1000;
    return value;
  };

  const mgPerPill = extractMg(medicineDosage);

  const toggleDay = (dayKey) => {
    const newDoses = { ...dayDoses };
    if (newDoses[dayKey]) {
      delete newDoses[dayKey];
    } else {
      newDoses[dayKey] = { whole: 1, half: 0 };
    }
    onChange(newDoses);
  };

  const updateDose = (dayKey, field, value) => {
    const newDoses = { ...dayDoses };
    if (newDoses[dayKey]) {
      newDoses[dayKey] = { ...newDoses[dayKey], [field]: Math.max(0, parseInt(value) || 0) };
    }
    onChange(newDoses);
  };

  const calculateTotalMg = (dose) => {
    if (!mgPerPill || !dose) return null;
    const pills = (dose.whole || 0) + (dose.half || 0) * 0.5;
    const total = mgPerPill * pills;
    return total % 1 === 0 ? total : total.toFixed(1);
  };

  return (
    <div className="space-y-2">
      {DAYS.map(day => {
        const isActive = !!dayDoses[day.key];
        const dose = dayDoses[day.key];
        const totalMg = calculateTotalMg(dose);
        
        return (
          <div key={day.key} className={`rounded-xl border transition-all ${
            isActive ? 'bg-zinc-800/50 border-emerald-500/30' : 'bg-zinc-900/30 border-zinc-800'
          }`}>
            <div 
              className="flex items-center justify-between p-3 cursor-pointer"
              onClick={() => toggleDay(day.key)}
            >
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-medium ${
                  isActive ? 'bg-emerald-500 text-white' : 'bg-zinc-800 text-zinc-400'
                }`}>
                  {language === 'da' ? day.da : day.en}
                </div>
                {isActive && totalMg && (
                  <span className="text-emerald-400 font-medium">{totalMg}mg</span>
                )}
              </div>
              {isActive && (
                <div className="text-sm text-zinc-400">
                  {dose.whole || 0} + {dose.half || 0}½
                </div>
              )}
            </div>
            
            {isActive && (
              <div className="px-3 pb-3 flex gap-3" onClick={e => e.stopPropagation()}>
                <div className="flex-1">
                  <label className="block text-xs text-zinc-500 mb-1">
                    {language === 'da' ? 'Hele' : 'Whole'}
                  </label>
                  <input
                    type="number"
                    value={dose.whole || 0}
                    onChange={e => updateDose(day.key, 'whole', e.target.value)}
                    className="input-field text-center py-2"
                    min="0"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-zinc-500 mb-1">
                    {language === 'da' ? 'Halve' : 'Half'}
                  </label>
                  <input
                    type="number"
                    value={dose.half || 0}
                    onChange={e => updateDose(day.key, 'half', e.target.value)}
                    className="input-field text-center py-2"
                    min="0"
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export const Schedule = () => {
  const { t, language, medicines, timeSlots, schedule, addScheduleEntry, deleteScheduleEntry, updateScheduleEntry, updateTimeSlot, loading } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [formData, setFormData] = useState({
    medicine_id: '',
    slot_id: '',
    day_doses: {}
  });
  
  const resetForm = () => {
    setFormData({
      medicine_id: '',
      slot_id: '',
      day_doses: {}
    });
    setEditingEntry(null);
    setShowForm(false);
  };
  
  const handleEdit = (entry) => {
    setFormData({
      medicine_id: entry.medicine_id,
      slot_id: entry.slot_id,
      day_doses: entry.day_doses || {}
    });
    setEditingEntry(entry);
    setShowForm(true);
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingEntry) {
        await updateScheduleEntry(editingEntry.entry_id, {
          day_doses: formData.day_doses
        });
      } else {
        await addScheduleEntry(formData);
      }
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

  const formatDayDoses = (dayDoses, medicineDosage) => {
    if (!dayDoses || Object.keys(dayDoses).length === 0) return '';
    
    const extractMg = (str) => {
      const match = str?.match(/(\d+(?:[.,]\d+)?)\s*(mg|g|mcg|µg)/i);
      if (!match) return null;
      let val = parseFloat(match[1].replace(',', '.'));
      if (match[2].toLowerCase() === 'g') val *= 1000;
      return val;
    };
    
    const mgPerPill = extractMg(medicineDosage);
    const dayLabels = language === 'da' 
      ? { mon: 'Man', tue: 'Tir', wed: 'Ons', thu: 'Tor', fri: 'Fre', sat: 'Lør', sun: 'Søn' }
      : { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
    
    // Group by dose
    const doseGroups = {};
    Object.entries(dayDoses).forEach(([day, dose]) => {
      const pills = (dose.whole || 0) + (dose.half || 0) * 0.5;
      const mg = mgPerPill ? mgPerPill * pills : null;
      const key = mg ? `${mg}mg` : `${pills}p`;
      if (!doseGroups[key]) doseGroups[key] = [];
      doseGroups[key].push(dayLabels[day]);
    });
    
    return Object.entries(doseGroups)
      .map(([dose, days]) => `${days.join('/')}: ${dose}`)
      .join(' • ');
  };
  
  // Group schedule by time slot
  const groupedSchedule = timeSlots.map(slot => ({
    ...slot,
    entries: schedule.filter(s => s.slot_id === slot.slot_id)
  })).filter(slot => slot.entries.length > 0);

  const selectedMedicine = medicines.find(m => m.medicine_id === (editingEntry?.medicine_id || formData.medicine_id));
  
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
              <div 
                className="flex items-center gap-3 mb-4 pb-4 border-b border-zinc-800 cursor-pointer"
                onClick={() => {
                  const el = document.querySelector(`[data-testid="timeslot-${slot.slot_id}"]`);
                  if (el) { el.scrollIntoView({ behavior: 'smooth' }); el.click(); }
                }}
              >
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-emerald-400" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold">{slot.name}</h3>
                  <p className="text-sm text-zinc-400">{slot.time}</p>
                </div>
              </div>
              
              <div className="space-y-3">
                {slot.entries.map(entry => (
                  <div 
                    key={entry.entry_id}
                    className="p-3 bg-zinc-800/50 rounded-xl"
                    data-testid={`schedule-entry-${entry.entry_id}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-medium">{entry.medicine_name}</p>
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleEdit(entry)}
                          className="p-2 hover:bg-zinc-700 rounded-lg transition-colors text-zinc-400 hover:text-emerald-400"
                          data-testid={`edit-schedule-${entry.entry_id}`}
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(entry.entry_id)}
                          className="p-2 hover:bg-zinc-700 rounded-lg transition-colors text-zinc-400 hover:text-red-400"
                          data-testid={`delete-schedule-${entry.entry_id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <p className="text-sm text-zinc-400">
                      {formatDayDoses(entry.day_doses, entry.medicine_dosage)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* Time Slots - clickable to edit time */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold mb-4">{t('timeSlots')}</h2>
        <div className="grid grid-cols-2 gap-3">
          {timeSlots.map(slot => (
            <EditableTimeSlot 
              key={slot.slot_id} 
              slot={slot} 
              onSave={(s, newTime) => updateTimeSlot(s.slot_id, { name: s.name, time: newTime, order: s.order })} 
            />
          ))}
        </div>
      </div>
      
      {/* Add/Edit Schedule Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50 overflow-y-auto" data-testid="schedule-form-modal">
          <div className="glass-card w-full max-w-md p-6 animate-fade-in my-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold">
                {editingEntry ? (language === 'da' ? 'Rediger dosis' : 'Edit Dose') : t('addToSchedule')}
              </h2>
              <button
                onClick={resetForm}
                className="p-2 hover:bg-zinc-700 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              {!editingEntry && (
                <>
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
                </>
              )}
              
              {editingEntry && (
                <div className="p-3 bg-zinc-800/50 rounded-xl mb-2">
                  <p className="font-medium">{editingEntry.medicine_name}</p>
                  <p className="text-sm text-zinc-400">{editingEntry.slot_name} ({editingEntry.slot_time})</p>
                </div>
              )}

              {(formData.medicine_id || editingEntry) && (
                <div>
                  <label className="block text-sm text-zinc-400 mb-2">
                    {language === 'da' ? 'Dosis per dag' : 'Dose per day'}
                  </label>
                  <DayDoseSelector
                    dayDoses={formData.day_doses}
                    onChange={dayDoses => setFormData(prev => ({ ...prev, day_doses: dayDoses }))}
                    language={language}
                    medicineDosage={selectedMedicine?.dosage || editingEntry?.medicine_dosage}
                  />
                </div>
              )}
              
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
                  disabled={loading || (!editingEntry && (!formData.medicine_id || !formData.slot_id)) || Object.keys(formData.day_doses).length === 0}
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
