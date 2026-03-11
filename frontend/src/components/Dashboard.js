import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { format, addDays, startOfWeek, isSameDay, parseISO } from 'date-fns';
import { da, enUS } from 'date-fns/locale';
import { 
  Check, 
  Clock, 
  ChevronLeft, 
  ChevronRight,
  AlertTriangle,
  ThumbsUp,
  Undo2
} from 'lucide-react';

const DayNames = {
  da: ['Søn', 'Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
};

const DayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export const Dashboard = () => {
  const { 
    t, language, user, medicines, timeSlots, schedule, logs, 
    fetchLogs, takeMedicine, undoTakeMedicine 
  } = useApp();
  
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const locale = language === 'da' ? da : enUS;
  
  const dateString = format(selectedDate, 'yyyy-MM-dd');
  const dayKey = DayKeys[selectedDate.getDay()];
  
  useEffect(() => {
    fetchLogs(dateString);
  }, [dateString, fetchLogs]);
  
  // Get today's schedule
  const todaySchedule = timeSlots.map(slot => {
    const entries = schedule.filter(s => 
      s.slot_id === slot.slot_id && 
      s.days.includes(dayKey)
    );
    
    const medicines_for_slot = entries.map(entry => {
      const medicine = medicines.find(m => m.medicine_id === entry.medicine_id);
      const log = logs.find(l => 
        l.medicine_id === entry.medicine_id && 
        l.slot_id === slot.slot_id &&
        l.date === dateString
      );
      return {
        ...entry,
        medicine,
        taken: !!log,
        log_id: log?.log_id,
        pills_whole: entry.pills_whole || 1,
        pills_half: entry.pills_half || 0
      };
    }).filter(e => e.medicine);
    
    return {
      ...slot,
      medicines: medicines_for_slot
    };
  }).filter(slot => slot.medicines.length > 0);
  
  const handleTakeMedicine = async (medicineId, slotId) => {
    try {
      await takeMedicine(medicineId, slotId, dateString);
    } catch (err) {
      console.error(err);
    }
  };
  
  const handleUndo = async (logId) => {
    try {
      await undoTakeMedicine(logId, dateString);
    } catch (err) {
      console.error(err);
    }
  };
  
  const getStatusIcon = (status) => {
    switch (status) {
      case 'green':
        return <ThumbsUp className="w-4 h-4 text-emerald-400" />;
      case 'yellow':
        return <AlertTriangle className="w-4 h-4 text-amber-400" />;
      case 'red':
        return <AlertTriangle className="w-4 h-4 text-red-400" />;
      default:
        return null;
    }
  };
  
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  
  const goToPrevWeek = () => setWeekStart(addDays(weekStart, -7));
  const goToNextWeek = () => setWeekStart(addDays(weekStart, 7));
  
  return (
    <div className="p-4 pb-24 max-w-2xl mx-auto animate-fade-in" data-testid="dashboard">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1">{t('dashboard')}</h1>
        <p className="text-zinc-400">
          {t('welcome')}, {user?.name}
        </p>
      </div>
      
      {/* Week Selector */}
      <div className="glass-card p-4 mb-6" data-testid="week-selector">
        <div className="flex items-center justify-between mb-4">
          <button 
            onClick={goToPrevWeek}
            className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
            data-testid="prev-week-btn"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="font-medium">
            {format(weekStart, 'MMM yyyy', { locale })}
          </span>
          <button 
            onClick={goToNextWeek}
            className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
            data-testid="next-week-btn"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
        
        <div className="grid grid-cols-7 gap-2">
          {weekDays.map((day, i) => {
            const isSelected = isSameDay(day, selectedDate);
            const isToday = isSameDay(day, new Date());
            
            return (
              <button
                key={i}
                onClick={() => setSelectedDate(day)}
                className={`flex flex-col items-center py-2 px-1 rounded-xl transition-all ${
                  isSelected 
                    ? 'bg-emerald-500 text-white' 
                    : isToday 
                      ? 'bg-zinc-800 text-emerald-400' 
                      : 'hover:bg-zinc-800'
                }`}
                data-testid={`day-btn-${i}`}
              >
                <span className="text-xs text-inherit opacity-70">
                  {DayNames[language][day.getDay()]}
                </span>
                <span className="text-lg font-semibold">
                  {format(day, 'd')}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      
      {/* Today's Schedule */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Clock className="w-5 h-5 text-emerald-400" />
          {t('todaySchedule')}
        </h2>
        
        {todaySchedule.length === 0 ? (
          <div className="glass-card p-8 text-center" data-testid="no-schedule-msg">
            <p className="text-zinc-400">{t('noMedicineToday')}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {todaySchedule.map(slot => (
              <div key={slot.slot_id} className="glass-card p-4" data-testid={`slot-${slot.slot_id}`}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                    <Clock className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{slot.name}</h3>
                    <p className="text-sm text-zinc-400">{slot.time}</p>
                  </div>
                </div>
                
                <div className="space-y-2">
                  {slot.medicines.map(item => (
                    <div 
                      key={item.entry_id}
                      className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                        item.taken 
                          ? 'bg-emerald-500/10 border-emerald-500/30' 
                          : 'bg-zinc-800/50 border-zinc-700 hover:border-zinc-600'
                      }`}
                      data-testid={`medicine-item-${item.medicine_id}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                          item.taken ? 'bg-emerald-500' : 'bg-zinc-700'
                        }`}>
                          {item.taken ? (
                            <Check className="w-4 h-4 text-white" />
                          ) : (
                            getStatusIcon(item.medicine?.status)
                          )}
                        </div>
                        <div>
                          <p className={`font-medium ${item.taken ? 'text-emerald-400' : ''}`}>
                            {item.medicine?.name}
                          </p>
                          <p className="text-xs text-zinc-500">
                            {item.medicine?.dosage} • {item.pills_whole || 1}{item.pills_half > 0 ? ` + ${item.pills_half}½` : ''} {t('pills')}
                          </p>
                        </div>
                      </div>
                      
                      {item.taken ? (
                        <button
                          onClick={() => handleUndo(item.log_id)}
                          className="p-2 hover:bg-zinc-700 rounded-lg transition-colors"
                          title={t('undo')}
                          data-testid={`undo-btn-${item.medicine_id}`}
                        >
                          <Undo2 className="w-4 h-4 text-zinc-400" />
                        </button>
                      ) : (
                        <button
                          onClick={() => handleTakeMedicine(item.medicine_id, slot.slot_id)}
                          className="btn-primary py-2 px-4 text-sm"
                          data-testid={`take-btn-${item.medicine_id}`}
                        >
                          <Check className="w-4 h-4" />
                          {t('markAsTaken')}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* Stock Alerts */}
      {medicines.filter(m => m.status !== 'green').length > 0 && (
        <div className="glass-card p-4" data-testid="stock-alerts">
          <h2 className="text-lg font-semibold mb-4">{t('lowStock')}</h2>
          <div className="space-y-2">
            {medicines.filter(m => m.status !== 'green').map(med => (
              <div 
                key={med.medicine_id}
                className={`flex items-center justify-between p-3 rounded-xl ${
                  med.status === 'red' ? 'status-red' : 'status-yellow'
                }`}
                data-testid={`alert-${med.medicine_id}`}
              >
                <div className="flex items-center gap-3">
                  <AlertTriangle className="w-5 h-5" />
                  <span className="font-medium">{med.name}</span>
                </div>
                <span className="text-sm">
                  {med.days_until_empty} {t('daysUntilEmpty')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
