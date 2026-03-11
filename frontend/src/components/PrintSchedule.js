import React, { useRef } from 'react';
import { useApp } from '../context/AppContext';
import { Printer, X } from 'lucide-react';

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
  const printRef = useRef();

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
    if (whole > 0 && half > 0) {
      pillsStr = `${whole}½`;
    } else if (half > 0) {
      pillsStr = `½`;
      if (half > 1) pillsStr = `${half}×½`;
    } else {
      pillsStr = `${whole}`;
    }
    
    const mg = mgPerPill ? (mgPerPill * totalPills) : null;
    const mgStr = mg ? (mg % 1 === 0 ? `${mg}mg` : `${mg.toFixed(1)}mg`) : '';
    
    return { pills: pillsStr, mg: mgStr };
  };

  // Get only time slots that have schedule entries
  const usedTimeSlots = timeSlots.filter(slot => 
    schedule.some(s => s.slot_id === slot.slot_id && Object.keys(s.day_doses || {}).length > 0)
  );

  // Group schedule by time slot
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

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    
    const today = new Date();
    const dateStr = today.toLocaleDateString(language === 'da' ? 'da-DK' : 'en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    let tableRows = '';
    
    scheduleBySlot.forEach(slot => {
      tableRows += `<tr><td colspan="8" class="slot-header">${slot.name} (${slot.time})</td></tr>`;
      
      slot.entries.forEach(entry => {
        let row = `<tr><td class="medicine-name">${entry.medicine_name}<br><span class="medicine-dosage">${entry.medicine_dosage}</span></td>`;
        
        DAYS.forEach(day => {
          const dose = entry.day_doses?.[day.key];
          const formatted = formatDose(dose, entry.mgPerPill);
          if (dose) {
            row += `<td class="dose-cell"><div class="dose-pills">${formatted.pills}</div>${formatted.mg ? `<div class="dose-mg">${formatted.mg}</div>` : ''}</td>`;
          } else {
            row += `<td class="dose-cell"><span class="empty-dose">-</span></td>`;
          }
        });
        
        row += '</tr>';
        tableRows += row;
      });
    });
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${language === 'da' ? 'Ugeskema' : 'Weekly Schedule'} - ${user?.name}</title>
        <style>
          @page {
            size: A4 landscape;
            margin: 15mm;
          }
          @media print {
            body {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
          }
          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }
          body {
            font-family: Arial, sans-serif;
            font-size: 12px;
            color: #000;
            background: #fff;
            padding: 20px;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 3px solid #10b981;
          }
          .title {
            font-size: 24px;
            font-weight: 700;
            color: #000;
          }
          .user-name {
            font-size: 16px;
            color: #333;
            margin-top: 5px;
          }
          .print-date {
            font-size: 11px;
            color: #666;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
          }
          th, td {
            border: 2px solid #333;
            padding: 8px 10px;
            text-align: center;
            vertical-align: middle;
          }
          th {
            background: #f0f0f0 !important;
            font-weight: 700;
            color: #000;
            font-size: 13px;
          }
          .slot-header {
            background: #10b981 !important;
            color: #fff !important;
            font-weight: 700;
            font-size: 14px;
            text-align: left;
            padding: 10px 15px;
          }
          .medicine-name {
            text-align: left;
            font-weight: 700;
            background: #f8f8f8 !important;
            color: #000;
            font-size: 13px;
            min-width: 150px;
          }
          .medicine-dosage {
            font-size: 10px;
            color: #666;
            font-weight: normal;
          }
          .dose-cell {
            min-width: 70px;
            background: #fff !important;
          }
          .dose-pills {
            font-weight: 700;
            font-size: 16px;
            color: #000;
          }
          .dose-mg {
            font-size: 10px;
            color: #10b981;
            font-weight: 600;
          }
          .empty-dose {
            color: #ccc;
            font-size: 14px;
          }
          .day-header {
            font-weight: 700;
            min-width: 70px;
          }
          .footer {
            margin-top: 25px;
            padding-top: 15px;
            border-top: 1px solid #ccc;
            font-size: 10px;
            color: #666;
            display: flex;
            justify-content: space-between;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="title">${language === 'da' ? 'UGESKEMA' : 'WEEKLY SCHEDULE'}</div>
            <div class="user-name">${user?.name}</div>
          </div>
          <div class="print-date">${language === 'da' ? 'Udskrevet' : 'Printed'}: ${dateStr}</div>
        </div>
        
        ${scheduleBySlot.length === 0 
          ? `<p style="text-align:center;padding:40px;color:#666;">${language === 'da' ? 'Intet skema at vise' : 'No schedule to display'}</p>`
          : `<table>
              <thead>
                <tr>
                  <th style="text-align:left;min-width:150px;">${language === 'da' ? 'Medicin' : 'Medicine'}</th>
                  ${DAYS.map(day => `<th class="day-header">${language === 'da' ? day.short_da : day.short_en}</th>`).join('')}
                </tr>
              </thead>
              <tbody>
                ${tableRows}
              </tbody>
            </table>`
        }
        
        <div class="footer">
          <span>MediTrack</span>
          <span>${language === 'da' ? 'Hold dette skema opdateret' : 'Keep this schedule updated'}</span>
        </div>
      </body>
      </html>
    `);
    
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 500);
  };

  const today = new Date();
  const dateStr = today.toLocaleDateString(language === 'da' ? 'da-DK' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 overflow-auto">
      <div className="bg-[#0a0a0f] border border-zinc-800 rounded-2xl w-full max-w-6xl max-h-[90vh] overflow-auto">
        {/* Controls */}
        <div className="sticky top-0 bg-[#0a0a0f] border-b border-zinc-800 p-4 flex items-center justify-between z-10">
          <h2 className="text-xl font-bold text-white">
            {language === 'da' ? 'Ugeskema til print' : 'Weekly Schedule for Print'}
          </h2>
          <div className="flex gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors"
              data-testid="print-btn"
            >
              <Printer className="w-5 h-5" />
              {language === 'da' ? 'Print' : 'Print'}
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-zinc-400" />
            </button>
          </div>
        </div>

        {/* Preview Content */}
        <div ref={printRef} className="p-6 bg-[#12121a]">
          {/* Header */}
          <div className="flex justify-between items-center mb-6 pb-4 border-b-2 border-emerald-500">
            <div>
              <h1 className="text-2xl font-bold text-white">
                {language === 'da' ? 'UGESKEMA' : 'WEEKLY SCHEDULE'}
              </h1>
              <p className="text-zinc-400 mt-1">{user?.name}</p>
            </div>
            <p className="text-sm text-zinc-500">
              {language === 'da' ? 'Udskrevet' : 'Printed'}: {dateStr}
            </p>
          </div>

          {scheduleBySlot.length === 0 ? (
            <div className="text-center py-12 text-zinc-500">
              {language === 'da' ? 'Intet skema at vise' : 'No schedule to display'}
            </div>
          ) : (
            <div className="overflow-x-auto">
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
          )}

          {/* Footer */}
          <div className="mt-6 pt-4 border-t border-zinc-800 flex justify-between text-xs text-zinc-500">
            <span>MediTrack</span>
            <span>{language === 'da' ? 'Hold dette skema opdateret' : 'Keep this schedule updated'}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
