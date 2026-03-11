import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Download, X, Loader2 } from 'lucide-react';
import { jsPDF } from 'jspdf';

const DAYS = [
  { key: 'mon', da: 'Mandag', en: 'Monday', short_da: 'Man', short_en: 'Mon' },
  { key: 'tue', da: 'Tirsdag', en: 'Tuesday', short_da: 'Tir', short_en: 'Tue' },
  { key: 'wed', da: 'Onsdag', en: 'Wednesday', short_da: 'Ons', short_en: 'Wed' },
  { key: 'thu', da: 'Torsdag', en: 'Thursday', short_da: 'Tor', short_en: 'Thu' },
  { key: 'fri', da: 'Fredag', en: 'Friday', short_da: 'Fre', short_en: 'Fri' },
  { key: 'sat', da: 'Lørdag', en: 'Saturday', short_da: 'Lør', short_en: 'Sat' },
  { key: 'sun', da: 'Søndag', en: 'Sunday', short_da: 'Søn', short_en: 'Sun' }
];

export const PrintSchedule = ({ onClose }) => {
  const { user, language, medicines, timeSlots, schedule } = useApp();
  const [generating, setGenerating] = useState(false);

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

  const usedTimeSlots = timeSlots.filter(slot =>
    schedule.some(s => s.slot_id === slot.slot_id && Object.keys(s.day_doses || {}).length > 0)
  );

  const scheduleBySlot = usedTimeSlots.map(slot => {
    const entries = schedule.filter(s => s.slot_id === slot.slot_id);
    return {
      ...slot,
      entries: entries.map(entry => {
        const medicine = medicines.find(m => m.medicine_id === entry.medicine_id);
        return {
          ...entry,
          medicine_name: medicine?.name || entry.medicine_name,
          medicine_dosage: medicine?.dosage || entry.medicine_dosage,
          mgPerPill: extractMg(medicine?.dosage || entry.medicine_dosage)
        };
      })
    };
  }).filter(slot => slot.entries.length > 0);

  const generatePDF = async () => {
    setGenerating(true);
    try {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 15;
      let y = margin;

      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.text(language === 'da' ? 'UGESKEMA' : 'WEEKLY SCHEDULE', margin, y);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      doc.text(user?.name || '', margin, y + 8);
      const today = new Date();
      const pdfDateStr = today.toLocaleDateString(language === 'da' ? 'da-DK' : 'en-US');
      doc.setFontSize(10);
      doc.text(`${language === 'da' ? 'Dato' : 'Date'}: ${pdfDateStr}`, pageWidth - margin - 40, y);

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
        const headerHeight = 10;

        doc.setFillColor(240, 240, 240);
        doc.rect(margin, y, pageWidth - margin * 2, headerHeight, 'F');
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 0, 0);
        doc.text(language === 'da' ? 'Medicin' : 'Medicine', margin + 2, y + 7);
        let x = margin + colWidths.medicine;
        DAYS.forEach(day => {
          doc.text(language === 'da' ? day.short_da : day.short_en, x + colWidths.day / 2, y + 7, { align: 'center' });
          x += colWidths.day;
        });
        y += headerHeight;

        scheduleBySlot.forEach(slot => {
          doc.setFillColor(16, 185, 129);
          doc.rect(margin, y, pageWidth - margin * 2, 8, 'F');
          doc.setTextColor(255, 255, 255);
          doc.setFont('helvetica', 'bold');
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
              const dose = entry.day_doses?.[day.key];
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

      const fileName = `ugeskema_${(user?.name || 'medicin').replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
      const pdfBlob = doc.output('blob');
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('PDF generation error:', err);
      alert((language === 'da' ? 'Kunne ikke generere PDF: ' : 'Could not generate PDF: ') + err.message);
    } finally {
      setGenerating(false);
    }
  };

  const today = new Date();
  const dateStr = today.toLocaleDateString(language === 'da' ? 'da-DK' : 'en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  });

  return (
    <div className="fixed inset-0 bg-black/80 flex items-start justify-center z-50 overflow-auto" data-testid="print-schedule-modal">
      <div className="bg-[#0a0a0f] border border-zinc-800 sm:rounded-2xl w-full max-w-6xl sm:my-4 min-h-screen sm:min-h-0 sm:max-h-[90vh] overflow-auto">
        {/* Controls - responsive header */}
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
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
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
          {/* Header info */}
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 sm:mb-6 pb-3 sm:pb-4 border-b-2 border-emerald-500">
            <div>
              <h1 className="text-lg sm:text-2xl font-bold text-white">
                {language === 'da' ? 'UGESKEMA' : 'WEEKLY SCHEDULE'}
              </h1>
              <p className="text-sm text-zinc-400 mt-0.5">{user?.name}</p>
            </div>
            <p className="text-xs sm:text-sm text-zinc-500 mt-1 sm:mt-0">
              {language === 'da' ? 'Dato' : 'Date'}: {dateStr}
            </p>
          </div>

          {scheduleBySlot.length === 0 ? (
            <div className="text-center py-12 text-zinc-500 text-sm">
              {language === 'da' ? 'Intet skema at vise - tilføj medicin til skema først' : 'No schedule to display - add medicine to schedule first'}
            </div>
          ) : (
            <>
              {/* Desktop table view - hidden on mobile */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="border border-zinc-700 bg-zinc-800 text-white font-bold p-3 text-left min-w-[150px]">
                        {language === 'da' ? 'Medicin' : 'Medicine'}
                      </th>
                      {DAYS.map(day => (
                        <th key={day.key} className="border border-zinc-700 bg-zinc-800 text-white font-bold p-3 min-w-[80px]">
                          {language === 'da' ? day.short_da : day.short_en}
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
                              const dose = entry.day_doses?.[day.key];
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
                    {/* Time slot header */}
                    <div className="bg-emerald-600 text-white font-bold px-3 py-2 rounded-t-lg text-sm">
                      {slot.name} ({slot.time})
                    </div>
                    
                    <div className="space-y-px">
                      {slot.entries.map(entry => (
                        <div key={entry.entry_id} className="bg-zinc-900 border border-zinc-800 last:rounded-b-lg p-3">
                          {/* Medicine name + dosage */}
                          <div className="mb-2">
                            <div className="text-white font-semibold text-sm leading-tight">{entry.medicine_name}</div>
                            <div className="text-xs text-zinc-400">{entry.medicine_dosage}</div>
                          </div>
                          
                          {/* 7-day dose grid */}
                          <div className="grid grid-cols-7 gap-1">
                            {DAYS.map(day => {
                              const dose = entry.day_doses?.[day.key];
                              const formatted = formatDose(dose, entry.mgPerPill);
                              const hasDose = dose && (dose.whole > 0 || dose.half > 0);
                              return (
                                <div key={day.key} className={`text-center rounded-md py-1.5 ${hasDose ? 'bg-emerald-500/15 border border-emerald-500/30' : 'bg-zinc-800/50 border border-zinc-700/30'}`}>
                                  <div className={`text-[10px] font-medium ${hasDose ? 'text-emerald-300' : 'text-zinc-500'}`}>
                                    {language === 'da' ? day.short_da : day.short_en}
                                  </div>
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
