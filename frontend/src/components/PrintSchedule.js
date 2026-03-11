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
    const mgStr = mg ? (mg % 1 === 0 ? `${mg}mg` : `${mg.toFixed(2)}mg`) : '';
    
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
    const printContent = printRef.current;
    const printWindow = window.open('', '_blank');
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${language === 'da' ? 'Ugeskema' : 'Weekly Schedule'} - ${user?.name}</title>
        <style>
          @page {
            size: A4 landscape;
            margin: 10mm;
          }
          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }
          body {
            font-family: 'Segoe UI', Arial, sans-serif;
            font-size: 11px;
            color: #f4f4f5;
            background: #0a0a0f;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 2px solid #10b981;
          }
          .title {
            font-size: 18px;
            font-weight: 700;
            color: #f4f4f5;
          }
          .user-name {
            font-size: 14px;
            color: #a1a1aa;
          }
          .print-date {
            font-size: 10px;
            color: #71717a;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 15px;
          }
          th, td {
            border: 1px solid #27272a;
            padding: 6px 8px;
            text-align: center;
            vertical-align: middle;
          }
          th {
            background: #1a1a24;
            font-weight: 600;
            color: #f4f4f5;
          }
          .slot-header {
            background: #10b981 !important;
            color: white !important;
            font-weight: 600;
            text-align: left;
            padding: 8px 12px;
          }
          .medicine-name {
            text-align: left;
            font-weight: 600;
            background: #12121a;
            color: #f4f4f5;
          }
          .medicine-dosage {
            font-size: 9px;
            color: #a1a1aa;
            font-weight: normal;
          }
          .dose-cell {
            min-width: 60px;
            background: #12121a;
          }
          .dose-pills {
            font-weight: 600;
            font-size: 12px;
            color: #f4f4f5;
          }
          .dose-mg {
            font-size: 9px;
            color: #10b981;
            font-weight: 500;
          }
          .empty-dose {
            color: #3f3f46;
          }
          .day-header {
            font-weight: 600;
            min-width: 70px;
          }
          .footer {
            margin-top: 20px;
            padding-top: 10px;
            border-top: 1px solid #27272a;
            font-size: 9px;
            color: #71717a;
            display: flex;
            justify-content: space-between;
          }
        </style>
      </head>
      <body>
        ${printContent.innerHTML}
      </body>
      </html>
    `);
    
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  const today = new Date();
  const dateStr = today.toLocaleDateString(language === 'da' ? 'da-DK' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 overflow-auto">
      <div className="bg-white rounded-2xl w-full max-w-6xl max-h-[90vh] overflow-auto">
        {/* Controls */}
        <div className="sticky top-0 bg-white border-b border-gray-200 p-4 flex items-center justify-between z-10">
          <h2 className="text-xl font-bold text-gray-800">
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
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-600" />
            </button>
          </div>
        </div>

        {/* Print Content */}
        <div ref={printRef} className="p-6">
          <div className="header">
            <div>
              <div className="title">
                {language === 'da' ? 'UGESKEMA' : 'WEEKLY SCHEDULE'}
              </div>
              <div className="user-name">{user?.name}</div>
            </div>
            <div className="print-date">
              {language === 'da' ? 'Udskrevet' : 'Printed'}: {dateStr}
            </div>
          </div>

          {scheduleBySlot.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              {language === 'da' ? 'Intet skema at vise' : 'No schedule to display'}
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th style={{ width: '140px', textAlign: 'left' }}>
                    {language === 'da' ? 'Medicin' : 'Medicine'}
                  </th>
                  {DAYS.map(day => (
                    <th key={day.key} className="day-header">
                      {language === 'da' ? day.short_da : day.short_en}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {scheduleBySlot.map(slot => (
                  <React.Fragment key={slot.slot_id}>
                    <tr>
                      <td colSpan={8} className="slot-header">
                        {slot.name} ({slot.time})
                      </td>
                    </tr>
                    {slot.entries.map(entry => (
                      <tr key={entry.entry_id}>
                        <td className="medicine-name">
                          {entry.medicine_name}
                          <div className="medicine-dosage">{entry.medicine_dosage}</div>
                        </td>
                        {DAYS.map(day => {
                          const dose = entry.day_doses?.[day.key];
                          const formatted = formatDose(dose, entry.mgPerPill);
                          return (
                            <td key={day.key} className="dose-cell">
                              {dose ? (
                                <>
                                  <div className="dose-pills">{formatted.pills}</div>
                                  {formatted.mg && <div className="dose-mg">{formatted.mg}</div>}
                                </>
                              ) : (
                                <span className="empty-dose">-</span>
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
          )}

          <div className="footer">
            <span>MediTrack</span>
            <span>{language === 'da' ? 'Hold dette skema opdateret' : 'Keep this schedule updated'}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
