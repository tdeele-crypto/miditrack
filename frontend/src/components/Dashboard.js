import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { format, addDays, addWeeks, startOfWeek, isSameDay, parseISO, differenceInCalendarDays, differenceInCalendarWeeks, getDate } from 'date-fns';
import { da, enUS } from 'date-fns/locale';
import { Clock, AlertTriangle, Printer, Pill, ChevronLeft, ChevronRight, BarChart3, X } from 'lucide-react';
import { PrintSchedule } from './PrintSchedule';

const DayNames = {
  da: ['Søn', 'Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
};

const DayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export const Dashboard = () => {
  const { t, language, user, medicines, timeSlots, schedule } = useApp();
  
  const [currentWeekStart, setCurrentWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showPrintSchedule, setShowPrintSchedule] = useState(false);
  const [showStockChart, setShowStockChart] = useState(false);
  
  const dayKey = DayKeys[selectedDate.getDay()];
  const locale = language === 'da' ? da : enUS;
  
  const extractDosageInfo = (dosageStr) => {
    if (!dosageStr) return null;
    const match = dosageStr.match(/(\d+(?:[.,]\d+)?)\s*(mg|g|mcg|µg)/i);
    if (!match) return null;
    const value = parseFloat(match[1].replace(',', '.'));
    const unit = match[2];
    return { value, unit };
  };

  const isSpecialOrdinationActive = (ord, date) => {
    if (!ord || !ord.start_date) return false;
    const start = parseISO(ord.start_date);
    if (date < start) return false;
    if (ord.end_date) {
      const end = parseISO(ord.end_date);
      if (date > end) return false;
    }
    const daysDiff = differenceInCalendarDays(date, start);
    switch (ord.repeat) {
      case 'daily': return true;
      case 'weekly': return date.getDay() === start.getDay();
      case 'biweekly': return date.getDay() === start.getDay() && differenceInCalendarWeeks(date, start, { weekStartsOn: start.getDay() }) % 2 === 0;
      case 'monthly': return getDate(date) === getDate(start);
      default: return daysDiff === 0;
    }
  };

  const todaySchedule = timeSlots.map(slot => {
    const entries = schedule.filter(s => {
      if (s.slot_id !== slot.slot_id) return false;
      const dayDoses = s.day_doses || {};
      // Normal schedule: check day_doses for selected day
      if (dayDoses[dayKey]) return true;
      // Special ordination: check if active on selected date
      if (s.special_ordination) return isSpecialOrdinationActive(s.special_ordination, selectedDate);
      return false;
    });
    
    const medicines_for_slot = entries.map(entry => {
      const medicine = medicines.find(m => m.medicine_id === entry.medicine_id);
      const dayDose = entry.day_doses?.[dayKey] || (entry.special_ordination ? { whole: entry.special_ordination.whole || 1, half: entry.special_ordination.half || 0 } : { whole: 1, half: 0 });
      const pillsWhole = dayDose.whole || 0;
      const pillsHalf = dayDose.half || 0;
      const totalPills = pillsWhole + pillsHalf * 0.5;
      const dosageInfo = extractDosageInfo(medicine?.dosage || entry.medicine_dosage);
      const totalDosage = dosageInfo ? dosageInfo.value * totalPills : null;
      const dosageUnit = dosageInfo ? dosageInfo.unit : null;
      
      return {
        ...entry,
        medicine,
        pills_whole: pillsWhole,
        pills_half: pillsHalf,
        total_pills: totalPills,
        total_dosage: totalDosage,
        dosage_unit: dosageUnit,
        is_special: !!entry.special_ordination
      };
    }).filter(e => e.medicine);
    
    return { ...slot, medicines: medicines_for_slot };
  }).filter(slot => slot.medicines.length > 0);
  
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i));

  const goToPrevWeek = () => setCurrentWeekStart(prev => addWeeks(prev, -1));
  const goToNextWeek = () => setCurrentWeekStart(prev => addWeeks(prev, 1));
  const goToCurrentWeek = () => {
    setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));
    setSelectedDate(new Date());
  };

  const formatPillsDisplay = (whole, half) => {
    if (whole > 0 && half > 0) return `${whole}½`;
    if (half > 0) return `½`;
    return `${whole}`;
  };

  const weekLabel = `${format(weekDays[0], 'd. MMM', { locale })} - ${format(weekDays[6], 'd. MMM yyyy', { locale })}`;
  const isCurrentWeek = isSameDay(currentWeekStart, startOfWeek(new Date(), { weekStartsOn: 1 }));
  
  return (
    <div className="p-4 pb-24 max-w-2xl mx-auto animate-fade-in" data-testid="dashboard">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-1">{t('dashboard')}</h1>
          <p className="text-zinc-400">{t('welcome')}, {user?.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowStockChart(true)}
            className="p-2 bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-colors"
            data-testid="open-chart-btn"
          >
            <BarChart3 className="w-5 h-5 text-emerald-400" />
          </button>
          <button
            onClick={() => setShowPrintSchedule(true)}
            className="p-2 bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-colors"
            data-testid="open-print-btn"
          >
            <Printer className="w-5 h-5 text-emerald-400" />
          </button>
        </div>
      </div>
      
      {/* Week Navigation */}
      <div className="glass-card p-4 mb-6" data-testid="week-selector">
        <div className="flex items-center justify-between mb-3">
          <button 
            onClick={goToPrevWeek} 
            className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
            data-testid="prev-week-btn"
          >
            <ChevronLeft className="w-5 h-5 text-zinc-400" />
          </button>
          <button 
            onClick={goToCurrentWeek}
            className={`text-sm font-medium px-3 py-1 rounded-lg transition-colors ${
              isCurrentWeek ? 'text-emerald-400' : 'text-zinc-300 hover:bg-zinc-800'
            }`}
            data-testid="week-label"
          >
            {weekLabel}
          </button>
          <button 
            onClick={goToNextWeek} 
            className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
            data-testid="next-week-btn"
          >
            <ChevronRight className="w-5 h-5 text-zinc-400" />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1.5">
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
                <span className="text-xs font-bold">{DayNames[language][day.getDay()]}</span>
                <span className={`text-lg font-semibold ${isSelected ? 'text-white' : ''}`}>
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
                      className="flex items-center gap-3 p-3 rounded-xl bg-zinc-800/50 border border-zinc-700"
                      data-testid={`medicine-item-${item.medicine_id}`}
                    >
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          item.medicine?.status === 'green' ? 'bg-emerald-500/20' :
                          item.medicine?.status === 'yellow' ? 'bg-amber-500/20' : 'bg-red-500/20'
                        }`}>
                          <Pill className={`w-5 h-5 ${
                            item.medicine?.status === 'green' ? 'text-emerald-400' :
                            item.medicine?.status === 'yellow' ? 'text-amber-400' : 'text-red-400'
                          }`} />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium">{item.medicine?.name}</p>
                          <p className="text-xs text-zinc-500">{item.medicine?.dosage}</p>
                          <p className="text-sm text-emerald-400 font-semibold">
                            {formatPillsDisplay(item.pills_whole, item.pills_half)} {t(item.medicine?.unit || 'piller')}
                            {item.total_dosage && (
                              <span className="text-zinc-400 font-normal ml-2">
                                {item.total_dosage % 1 === 0 ? item.total_dosage : item.total_dosage.toFixed(2)}{item.dosage_unit}
                              </span>
                            )}
                          </p>
                          {item.is_special && (
                            <p className="text-xs text-emerald-400 mt-0.5">{language === 'da' ? 'Special ordination' : 'Special ordination'}</p>
                          )}
                        </div>
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
                <span className="text-sm">{med.days_until_empty} {t('daysUntilEmpty')}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {showPrintSchedule && (
        <PrintSchedule onClose={() => setShowPrintSchedule(false)} />
      )}

      {/* Stock Chart Modal */}
      {showStockChart && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-start justify-center overflow-auto" data-testid="stock-chart-modal">
          <div className="w-full max-w-lg mx-4 mt-8 mb-8 glass-card p-5 animate-fade-in">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">{language === 'da' ? 'Lagerstatus' : 'Stock Status'}</h2>
              <button onClick={() => setShowStockChart(false)} className="p-2 hover:bg-zinc-700 rounded-lg">
                <X className="w-5 h-5 text-zinc-400" />
              </button>
            </div>
            {medicines.length === 0 ? (
              <p className="text-zinc-500 text-sm text-center py-8">{language === 'da' ? 'Ingen medicin tilføjet' : 'No medicines added'}</p>
            ) : (
              <div className="space-y-3">
                {medicines.map(med => {
                  const daysLeft = med.days_until_empty ?? 999;
                  const reminder = med.reminder_days_before || 7;
                  // 100% if not in reminder zone, then count down from reminder_days to 0
                  const pct = daysLeft > reminder ? 100 : Math.min((daysLeft / reminder) * 100, 100);
                  const barColor = med.status === 'green' ? 'bg-emerald-500' : med.status === 'yellow' ? 'bg-amber-500' : 'bg-red-500';
                  const textColor = med.status === 'green' ? 'text-emerald-400' : med.status === 'yellow' ? 'text-amber-400' : 'text-red-400';
                  return (
                    <div key={med.medicine_id} data-testid={`chart-bar-${med.medicine_id}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-white truncate mr-2">{med.name}</span>
                        <span className={`text-sm font-bold ${textColor} shrink-0`}>{med.stock_count || 0} {t(med.unit || 'piller')}</span>
                      </div>
                      <div className="w-full h-5 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${barColor} transition-all duration-500`}
                          style={{ width: `${Math.max(pct, 2)}%` }}
                        />
                      </div>
                      <div className="flex justify-between mt-0.5">
                        <span className="text-[10px] text-zinc-500">{med.dosage}</span>
                        <span className="text-[10px] text-white">
                          {med.days_until_empty != null ? `${med.days_until_empty} ${language === 'da' ? 'dage' : 'days'}` : ''}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
