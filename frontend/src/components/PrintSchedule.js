import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Printer, X, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { startOfWeek, addDays, addWeeks, format, getISOWeek, parseISO, differenceInCalendarDays, differenceInCalendarWeeks, getDate, isSameDay } from 'date-fns';
import { da, enUS } from 'date-fns/locale';

const DAYS = [
  { key: 'mon', da: 'Mandag', en: 'Monday', short_da: 'Man', short_en: 'Mon', idx: 0 },
  { key: 'tue', da: 'Tirsdag', en: 'Tuesday', short_da: 'Tir', short_en: 'Tue', idx: 1 },
  { key: 'wed', da: 'Onsdag', en: 'Wednesday', short_da: 'Ons', short_en: 'Wed', idx: 2 },
  { key: 'thu', da: 'Torsdag', en: 'Thursday', short_da: 'Tor', short_en: 'Thu', idx: 3 },
  { key: 'fri', da: 'Fredag', en: 'Friday', short_da: 'Fre', short_en: 'Fri', idx: 4 },
  { key: 'sat', da: 'Lørdag', en: 'Saturday', short_da: 'Lør', short_en: 'Sat', idx: 5 },
  { key: 'sun', da: 'Søndag', en: 'Sunday', short_da: 'Søn', short_en: 'Sun', idx: 6 }
];

export const PrintSchedule = ({ onClose }) => {
  const { user, language, medicines, timeSlots, schedule } = useApp();
  const [generating, setGenerating] = useState(false);
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const locale = language === 'da' ? da : enUS;

  const weekDates = DAYS.map((_, i) => addDays(weekStart, i));
  const weekNumber = getISOWeek(weekStart);
  const isCurrentWeek = isSameDay(weekStart, startOfWeek(new Date(), { weekStartsOn: 1 }));

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

  const formatDose = (dose, mgPerPill) => {
    if (!dose) return { pills: '-', mg: '' };
    const whole = dose.whole || 0;
    const half = dose.half || 0;
    const totalPills = whole + half * 0.5;
    if (totalPills === 0) return { pills: '-', mg: '' };
    let pillsStr = '';
    if (whole > 0 && half > 0) pillsStr = `${whole}½`;
    else if (half > 0) pillsStr = half > 1 ? `${half}×½` : '½';
    else pillsStr = `${whole}`;
    const mg = mgPerPill ? (mgPerPill * totalPills) : null;
    const mgStr = mg ? (mg % 1 === 0 ? `${mg}mg` : `${mg.toFixed(1)}mg`) : '';
    return { pills: pillsStr, mg: mgStr };
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

  // Build schedule data for the selected week, including special ordinations
  const scheduleBySlot = timeSlots.map(slot => {
    const entries = schedule.filter(s => s.slot_id === slot.slot_id);
    const weekEntries = entries.map(entry => {
      const medicine = medicines.find(m => m.medicine_id === entry.medicine_id);
      const mgPerPill = extractMg(medicine?.dosage || entry.medicine_dosage);

      // Build day_doses for this week, merging normal + special ordination
      const weekDayDoses = {};
      let hasAnyDose = false;

      DAYS.forEach((day, i) => {
        const date = weekDates[i];
        const normalDose = entry.day_doses?.[day.key];
        const specialActive = entry.special_ordination && isSpecialOrdinationActive(entry.special_ordination, date);

        if (normalDose) {
          weekDayDoses[day.key] = normalDose;
          hasAnyDose = true;
        } else if (specialActive) {
          weekDayDoses[day.key] = { whole: 1, half: 0 };
          hasAnyDose = true;
        }
      });

      if (!hasAnyDose) return null;

      return {
        ...entry,
        medicine_name: medicine?.name || entry.medicine_name,
        medicine_dosage: medicine?.dosage || entry.medicine_dosage,
        mgPerPill,
        weekDayDoses
      };
    }).filter(Boolean);

    return { ...slot, entries: weekEntries };
  }).filter(slot => slot.entries.length > 0);

  const weekLabel = `${format(weekDates[0], 'd. MMM', { locale })} - ${format(weekDates[6], 'd. MMM yyyy', { locale })}`;

  const generatePDF = async () => {
    setGenerating(true);
    try {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 15;
      let y = margin;

      // Title with week number
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.text(`${language === 'da' ? 'UGESKEMA' : 'WEEKLY SCHEDULE'} - ${language === 'da' ? 'Uge' : 'Week'} ${weekNumber}`, margin, y);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      doc.text(user?.name || '', margin, y + 8);
      doc.setFontSize(10);
      doc.text(weekLabel, pageWidth - margin, y, { align: 'right' });

      y += 15;
      doc.setDrawColor(16, 185, 129);
      doc.setLineWidth(1);
      doc.line(margin, y, pageWidth - margin, y);
      y += 10;

      if (scheduleBySlot.length === 0) {
        doc.setFontSize(14);
        doc.text(language === 'da' ? 'Intet skema at vise' : 'No schedule to display', pageWidth / 2, y + 20, { align: 'center' });
      } else {
        const colWidths = { medicine: 50, day: (pageWidth - margin * 2 - 50) / 7 };
        const rowHeight = 12;
        const headerHeight = 14;

        // Header with day names + dates
        doc.setFillColor(240, 240, 240);
        doc.rect(margin, y, pageWidth - margin * 2, headerHeight, 'F');
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text(language === 'da' ? 'Medicin' : 'Medicine', margin + 2, y + 6);
        let x = margin + colWidths.medicine;
        DAYS.forEach((day, i) => {
          const date = weekDates[i];
          const dayName = language === 'da' ? day.short_da : day.short_en;
          const dateStr = format(date, 'd/M');
          doc.setFontSize(10);
          doc.setFont('helvetica', 'bold');
          doc.text(dayName, x + colWidths.day / 2, y + 6, { align: 'center' });
          doc.setFontSize(7);
          doc.setFont('helvetica', 'normal');
          doc.text(dateStr, x + colWidths.day / 2, y + 11, { align: 'center' });
          x += colWidths.day;
        });
        y += headerHeight;

        scheduleBySlot.forEach(slot => {
          doc.setFillColor(16, 185, 129);
          doc.rect(margin, y, pageWidth - margin * 2, 8, 'F');
          doc.setTextColor(255, 255, 255);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(10);
          doc.text(`${slot.name} (${slot.time})`, margin + 2, y + 6);
          y += 8;
          doc.setTextColor(0, 0, 0);

          slot.entries.forEach(entry => {
            if (y + rowHeight > pageHeight - margin) { doc.addPage(); y = margin; }
            doc.setFillColor(250, 250, 250);
            doc.rect(margin, y, pageWidth - margin * 2, rowHeight, 'F');
            doc.setDrawColor(200, 200, 200);
            doc.rect(margin, y, pageWidth - margin * 2, rowHeight, 'S');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.text(entry.medicine_name, margin + 2, y + 5);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7);
            doc.setTextColor(100, 100, 100);
            doc.text(entry.medicine_dosage || '', margin + 2, y + 10);
            doc.setTextColor(0, 0, 0);
            let xd = margin + colWidths.medicine;
            DAYS.forEach(day => {
              const dose = entry.weekDayDoses?.[day.key];
              const formatted = formatDose(dose, entry.mgPerPill);
              doc.setDrawColor(200, 200, 200);
              doc.line(xd, y, xd, y + rowHeight);
              if (dose) {
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(11);
                doc.text(formatted.pills, xd + colWidths.day / 2, y + 5, { align: 'center' });
                if (formatted.mg) {
                  doc.setFont('helvetica', 'normal');
                  doc.setFontSize(7);
                  doc.setTextColor(16, 185, 129);
                  doc.text(formatted.mg, xd + colWidths.day / 2, y + 10, { align: 'center' });
                  doc.setTextColor(0, 0, 0);
                }
              } else {
                doc.setTextColor(180, 180, 180);
                doc.text('-', xd + colWidths.day / 2, y + 7, { align: 'center' });
                doc.setTextColor(0, 0, 0);
              }
              xd += colWidths.day;
            });
            y += rowHeight;
          });
          y += 3;
        });
      }

      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text('MediTrack', margin, pageHeight - 10);
      doc.text(language === 'da' ? 'Hold dette skema opdateret' : 'Keep this schedule updated', pageWidth - margin, pageHeight - 10, { align: 'right' });

      const pdfBlob = doc.output('blob');
      const fileName = `ugeskema_uge${weekNumber}_${(user?.name || 'medicin').replace(/\s+/g, '_')}.pdf`;
      const url = URL.createObjectURL(new Blob([pdfBlob], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.error('PDF generation error:', err);
      alert((language === 'da' ? 'Kunne ikke generere PDF: ' : 'Could not generate PDF: ') + err.message);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-start justify-center z-50 overflow-auto" data-testid="print-schedule-modal">
      <div className="bg-[#0a0a0f] border border-zinc-800 sm:rounded-2xl w-full max-w-6xl sm:my-4 min-h-screen sm:min-h-0 sm:max-h-[90vh] overflow-auto">
        {/* Controls */}
        <div className="sticky top-0 bg-[#0a0a0f] border-b border-zinc-800 px-3 py-3 sm:px-4 sm:py-4 flex items-center justify-between z-10 gap-2">
          <h2 className="text-base sm:text-xl font-bold text-white truncate" data-testid="print-schedule-title">
            {language === 'da' ? 'Ugeskema' : 'Weekly Schedule'}
          </h2>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={generatePDF}
              disabled={generating}
              className="flex items-center gap-1.5 px-3 py-2 sm:px-4 sm:py-2 bg-emerald-500 text-white text-sm rounded-lg hover:bg-emerald-600 transition-colors disabled:opacity-50"
              data-testid="download-pdf-btn"
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
              <span className="hidden xs:inline">PDF</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
              data-testid="close-print-btn"
            >
              <X className="w-5 h-5 text-zinc-400" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-3 sm:p-6 bg-[#12121a]">
          {/* Header with week number + navigation */}
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 sm:mb-6 pb-3 sm:pb-4 border-b-2 border-emerald-500">
            <div>
              <h1 className="text-lg sm:text-2xl font-bold text-white" data-testid="print-week-title">
                {language === 'da' ? 'UGESKEMA' : 'WEEKLY SCHEDULE'} - {language === 'da' ? 'Uge' : 'Week'} {weekNumber}
              </h1>
              <p className="text-sm text-zinc-400 mt-0.5">{user?.name}</p>
            </div>
            {/* Week navigation */}
            <div className="flex items-center gap-2 mt-2 sm:mt-0" data-testid="print-week-nav">
              <button
                onClick={() => setWeekStart(prev => addWeeks(prev, -1))}
                className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
                data-testid="print-prev-week"
              >
                <ChevronLeft className="w-5 h-5 text-zinc-400" />
              </button>
              <button
                onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
                className={`text-xs sm:text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${
                  isCurrentWeek ? 'text-emerald-400' : 'text-zinc-300 hover:bg-zinc-800'
                }`}
                data-testid="print-week-label"
              >
                {weekLabel}
              </button>
              <button
                onClick={() => setWeekStart(prev => addWeeks(prev, 1))}
                className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
                data-testid="print-next-week"
              >
                <ChevronRight className="w-5 h-5 text-zinc-400" />
              </button>
            </div>
          </div>

          {scheduleBySlot.length === 0 ? (
            <div className="text-center py-12 text-zinc-500 text-sm">
              {language === 'da' ? 'Intet skema at vise for denne uge' : 'No schedule to display for this week'}
            </div>
          ) : (
            <>
              {/* Desktop table view */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="border border-zinc-700 bg-zinc-800 text-white font-bold p-3 text-left min-w-[150px]">
                        {language === 'da' ? 'Medicin' : 'Medicine'}
                      </th>
                      {DAYS.map((day, i) => (
                        <th key={day.key} className="border border-zinc-700 bg-zinc-800 text-white p-2 min-w-[80px]">
                          <div className="font-bold">{language === 'da' ? day.short_da : day.short_en}</div>
                          <div className="text-xs text-zinc-400 font-normal">{format(weekDates[i], 'd/M')}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {scheduleBySlot.map(slot => (
                      <React.Fragment key={slot.slot_id}>
                        <tr>
                          <td colSpan={8} className="bg-emerald-600 text-white font-bold p-3 text-left">
                            {slot.name} ({slot.time})
                          </td>
                        </tr>
                        {slot.entries.map(entry => (
                          <tr key={entry.entry_id}>
                            <td className="border border-zinc-700 bg-zinc-900 text-white font-semibold p-3 text-left">
                              {entry.medicine_name}
                              <div className="text-xs text-zinc-400 font-normal">{entry.medicine_dosage}</div>
                            </td>
                            {DAYS.map(day => {
                              const dose = entry.weekDayDoses?.[day.key];
                              const formatted = formatDose(dose, entry.mgPerPill);
                              return (
                                <td key={day.key} className="border border-zinc-700 bg-zinc-900 text-center p-3">
                                  {dose ? (
                                    <>
                                      <div className="text-lg font-bold text-white">{formatted.pills}</div>
                                      {formatted.mg && <div className="text-xs text-emerald-400 font-semibold">{formatted.mg}</div>}
                                    </>
                                  ) : (
                                    <span className="text-zinc-600">-</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile card view */}
              <div className="md:hidden space-y-3" data-testid="mobile-schedule-view">
                {scheduleBySlot.map(slot => (
                  <div key={slot.slot_id}>
                    <div className="bg-emerald-600 text-white font-bold px-3 py-2 rounded-t-lg text-sm">
                      {slot.name} ({slot.time})
                    </div>
                    <div className="space-y-px">
                      {slot.entries.map(entry => (
                        <div key={entry.entry_id} className="bg-zinc-900 border border-zinc-800 last:rounded-b-lg p-3">
                          <div className="mb-2">
                            <div className="text-white font-semibold text-sm leading-tight">{entry.medicine_name}</div>
                            <div className="text-xs text-zinc-400">{entry.medicine_dosage}</div>
                          </div>
                          <div className="grid grid-cols-7 gap-1">
                            {DAYS.map((day, i) => {
                              const dose = entry.weekDayDoses?.[day.key];
                              const formatted = formatDose(dose, entry.mgPerPill);
                              const hasDose = dose && ((dose.whole || 0) > 0 || (dose.half || 0) > 0);
                              return (
                                <div key={day.key} className={`text-center rounded-md py-1.5 ${hasDose ? 'bg-emerald-500/15 border border-emerald-500/30' : 'bg-zinc-800/50 border border-zinc-700/30'}`}>
                                  <div className={`text-[10px] font-medium ${hasDose ? 'text-emerald-300' : 'text-zinc-500'}`}>
                                    {language === 'da' ? day.short_da : day.short_en}
                                  </div>
                                  <div className="text-[9px] text-zinc-500">{format(weekDates[i], 'd/M')}</div>
                                  <div className={`text-sm font-bold leading-tight ${hasDose ? 'text-white' : 'text-zinc-600'}`}>
                                    {formatted.pills}
                                  </div>
                                  {formatted.mg && (
                                    <div className="text-[9px] text-emerald-400 leading-tight">{formatted.mg}</div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Footer */}
          <div className="mt-4 sm:mt-6 pt-3 sm:pt-4 border-t border-zinc-800 flex justify-between text-xs text-zinc-500">
            <span>MediTrack</span>
            <span>{language === 'da' ? 'Hold dette skema opdateret' : 'Keep this schedule updated'}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
