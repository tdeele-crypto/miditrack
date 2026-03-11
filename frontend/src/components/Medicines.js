import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { format, parseISO } from 'date-fns';
import { da, enUS } from 'date-fns/locale';
import { Calendar } from '../components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { 
  Plus, 
  ThumbsUp, 
  AlertTriangle, 
  Trash2, 
  Edit3,
  X,
  Package,
  CalendarIcon,
  Repeat
} from 'lucide-react';

const DatePickerField = ({ label, value, onChange, locale, testId }) => {
  const [open, setOpen] = useState(false);
  const dateValue = value ? parseISO(value) : null;
  
  return (
    <div>
      <label className="block text-sm text-zinc-400 mb-2">
        <CalendarIcon className="w-3.5 h-3.5 inline mr-1" />
        {label}
      </label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={`input-field w-full text-left flex items-center justify-between ${!value ? 'text-zinc-500' : ''}`}
            data-testid={testId}
          >
            {value ? format(dateValue, 'd. MMM yyyy', { locale }) : '—'}
            {value && (
              <span 
                onClick={e => { e.stopPropagation(); onChange(null); }} 
                className="text-zinc-500 hover:text-red-400 ml-2"
              >
                <X className="w-4 h-4" />
              </span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 bg-zinc-900 border-zinc-700" align="start">
          <Calendar
            mode="single"
            selected={dateValue}
            onSelect={date => { onChange(date ? format(date, 'yyyy-MM-dd') : null); setOpen(false); }}
            locale={locale}
            className="rounded-md"
          />
        </PopoverContent>
      </Popover>
    </div>
  );
};

export const Medicines = () => {
  const { t, language, medicines, addMedicine, updateMedicine, deleteMedicine, loading } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [editingMedicine, setEditingMedicine] = useState(null);
  const [showAddStock, setShowAddStock] = useState(null);
  const [addStockAmount, setAddStockAmount] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    dosage: '',
    stock_count: 30,
    reminder_days_before: 7,
    start_date: null,
    cancel_date: null,
    end_date: null,
    repeat_interval: null
  });
  
  const locale = language === 'da' ? da : enUS;
  
  const resetForm = () => {
    setFormData({
      name: '',
      dosage: '',
      stock_count: 30,
      reminder_days_before: 7,
      start_date: null,
      cancel_date: null,
      end_date: null,
      repeat_interval: null
    });
    setEditingMedicine(null);
    setShowForm(false);
    setShowDeleteConfirm(false);
  };
  
  const handleEdit = (medicine) => {
    setFormData({
      name: medicine.name,
      dosage: medicine.dosage,
      stock_count: medicine.stock_count,
      reminder_days_before: medicine.reminder_days_before,
      start_date: medicine.start_date || null,
      cancel_date: medicine.cancel_date || null,
      end_date: medicine.end_date || null,
      repeat_interval: medicine.repeat_interval || null
    });
    setEditingMedicine(medicine);
    setShowForm(true);
  };
  
  const handleAddStock = (medicine) => {
    setShowAddStock(medicine);
    setAddStockAmount('');
  };
  
  const submitAddStock = async () => {
    if (!showAddStock || !addStockAmount) return;
    const amount = parseFloat(addStockAmount);
    if (isNaN(amount) || amount <= 0) return;
    try {
      await updateMedicine(showAddStock.medicine_id, {
        stock_count: showAddStock.stock_count + amount
      });
      setShowAddStock(null);
      setAddStockAmount('');
    } catch (err) {
      console.error(err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingMedicine) {
        await updateMedicine(editingMedicine.medicine_id, formData);
      } else {
        await addMedicine(formData);
      }
      resetForm();
    } catch (err) {
      console.error(err);
    }
  };
  
  const handleDelete = async (medicineId) => {
    try {
      await deleteMedicine(medicineId);
    } catch (err) {
      console.error(err);
    }
  };
  
  const getStatusBadge = (status, daysUntilEmpty) => {
    switch (status) {
      case 'green':
        return (
          <div className="status-green w-full py-2 rounded-xl flex items-center justify-center gap-2 text-sm font-medium">
            <ThumbsUp className="w-4 h-4" />
            {t('stockOk')}
          </div>
        );
      case 'yellow':
        return (
          <div className="status-yellow w-full py-2 rounded-xl flex items-center justify-center gap-2 text-sm font-medium">
            <AlertTriangle className="w-4 h-4" />
            {daysUntilEmpty} {t('days')}
          </div>
        );
      case 'red':
        return (
          <div className="status-red w-full py-2 rounded-xl flex items-center justify-center gap-2 text-sm font-medium">
            <AlertTriangle className="w-4 h-4" />
            {t('orderSoon')}
          </div>
        );
      default:
        return null;
    }
  };
  
  return (
    <div className="p-4 pb-24 max-w-2xl mx-auto animate-fade-in" data-testid="medicines-page">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">{t('myMedicines')}</h1>
        <button 
          onClick={() => setShowForm(true)}
          className="btn-primary"
          data-testid="add-medicine-btn"
        >
          <Plus className="w-5 h-5" />
          {t('add')}
        </button>
      </div>
      
      {/* Medicine List */}
      {medicines.length === 0 ? (
        <div className="glass-card p-8 text-center" data-testid="no-medicines-msg">
          <Pill className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
          <p className="text-zinc-400">{t('noMedicines')}</p>
          <button 
            onClick={() => setShowForm(true)}
            className="btn-primary mt-4"
          >
            <Plus className="w-5 h-5" />
            {t('addMedicine')}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {medicines.map(medicine => (
            <div 
              key={medicine.medicine_id}
              className="glass-card p-4"
              data-testid={`medicine-card-${medicine.medicine_id}`}
            >
              <div className="text-center mb-3">
                <h3 className="font-semibold text-lg">{medicine.name}</h3>
                <p className="text-zinc-400 text-sm">{medicine.dosage}</p>
              </div>
              
              <div className="mb-3">
                {getStatusBadge(medicine.status, medicine.days_until_empty)}
              </div>
              
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="bg-zinc-800/50 rounded-xl p-3">
                  <div className="flex items-center gap-2 text-zinc-400 text-xs mb-1">
                    <Package className="w-3 h-3" />
                    {t('stockCount')}
                  </div>
                  <p className="font-semibold">{medicine.stock_count} {t('pills')}</p>
                </div>
                <div className="bg-zinc-800/50 rounded-xl p-3">
                  <div className="text-zinc-400 text-xs mb-1">{t('reminderDays')}</div>
                  <p className="font-semibold">{medicine.reminder_days_before} {t('days')}</p>
                </div>
              </div>
              
              <div className="flex gap-2">
                <button
                  onClick={() => handleEdit(medicine)}
                  className="btn-secondary flex-1 py-2"
                  data-testid={`edit-btn-${medicine.medicine_id}`}
                >
                  <Edit3 className="w-4 h-4" />
                  {t('edit')}
                </button>
                <button
                  onClick={() => handleAddStock(medicine)}
                  className="btn-secondary flex-1 py-2"
                  data-testid={`add-stock-btn-${medicine.medicine_id}`}
                >
                  <Plus className="w-4 h-4" />
                  {t('addStock')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* Add/Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 z-50 overflow-y-auto" data-testid="medicine-form-modal">
          <div className="min-h-full flex items-start justify-center p-4 pt-8 pb-8">
            <div className="glass-card w-full max-w-md p-6 animate-fade-in">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold">
                {editingMedicine ? t('editMedicine') : t('addMedicine')}
              </h2>
              <button
                onClick={resetForm}
                className="p-2 hover:bg-zinc-700 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-zinc-400 mb-2">{t('medicineName')}</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="input-field"
                  required
                  data-testid="medicine-name-input"
                />
              </div>
              
              <div>
                <label className="block text-sm text-zinc-400 mb-2">{t('dosage')}</label>
                <input
                  type="text"
                  value={formData.dosage}
                  onChange={e => setFormData(prev => ({ ...prev, dosage: e.target.value }))}
                  className="input-field"
                  placeholder="e.g., 500mg"
                  required
                  data-testid="medicine-dosage-input"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-zinc-400 mb-2">{t('stockCount')}</label>
                  <input
                    type="number"
                    value={formData.stock_count}
                    onChange={e => setFormData(prev => ({ ...prev, stock_count: parseInt(e.target.value) || 0 }))}
                    className="input-field"
                    min="0"
                    required
                    data-testid="medicine-stock-input"
                  />
                </div>
                <div>
                  <label className="block text-sm text-zinc-400 mb-2">{t('reminderDays')}</label>
                  <input
                    type="number"
                    value={formData.reminder_days_before}
                    onChange={e => setFormData(prev => ({ ...prev, reminder_days_before: parseInt(e.target.value) || 7 }))}
                    className="input-field"
                    min="1"
                    required
                    data-testid="medicine-reminder-input"
                  />
                </div>
              </div>
              
              {/* Date fields */}
              <div className="space-y-3 pt-2">
                <DatePickerField
                  label={t('startDate')}
                  value={formData.start_date}
                  onChange={val => setFormData(prev => ({ ...prev, start_date: val }))}
                  locale={locale}
                  testId="medicine-start-date"
                />
                <DatePickerField
                  label={t('cancelDate')}
                  value={formData.cancel_date}
                  onChange={val => setFormData(prev => ({ ...prev, cancel_date: val }))}
                  locale={locale}
                  testId="medicine-cancel-date"
                />
                <DatePickerField
                  label={t('endDate')}
                  value={formData.end_date}
                  onChange={val => setFormData(prev => ({ ...prev, end_date: val }))}
                  locale={locale}
                  testId="medicine-end-date"
                />
                
                {formData.end_date && (
                  <div>
                    <label className="block text-sm text-zinc-400 mb-2">
                      <Repeat className="w-3.5 h-3.5 inline mr-1" />
                      {t('repeatInterval')}
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {['daily', 'weekly', 'monthly'].map(interval => (
                        <button
                          key={interval}
                          type="button"
                          onClick={() => setFormData(prev => ({ 
                            ...prev, 
                            repeat_interval: prev.repeat_interval === interval ? null : interval 
                          }))}
                          className={`py-2 px-3 rounded-xl text-sm font-medium transition-all ${
                            formData.repeat_interval === interval
                              ? 'bg-emerald-500 text-white'
                              : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                          }`}
                          data-testid={`repeat-${interval}`}
                        >
                          {t(interval)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
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
                  disabled={loading}
                  className="btn-primary flex-1"
                  data-testid="save-medicine-btn"
                >
                  {loading ? t('loading') : t('save')}
                </button>
              </div>
              
              {editingMedicine && !showDeleteConfirm && (
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="w-full mt-4 py-2.5 rounded-xl flex items-center justify-center gap-2 text-sm font-medium bg-red-500/15 border border-red-500/30 text-red-400 hover:bg-red-500/25 transition-colors"
                  data-testid="delete-medicine-btn"
                >
                  <Trash2 className="w-4 h-4" />
                  {t('deleteMedicine')}
                </button>
              )}
              
              {editingMedicine && showDeleteConfirm && (
                <div className="mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/30" data-testid="delete-confirm-box">
                  <p className="text-sm text-red-300 text-center mb-3">
                    <span className="font-semibold">{editingMedicine.name}</span> {t('discontinueConfirm')}
                  </p>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(false)}
                      className="btn-secondary flex-1 text-sm"
                    >
                      {t('cancel')}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await handleDelete(editingMedicine.medicine_id);
                        resetForm();
                        setShowDeleteConfirm(false);
                      }}
                      className="flex-1 py-2 rounded-lg bg-red-500 text-white font-medium text-sm hover:bg-red-600 transition-colors"
                      data-testid="confirm-delete-btn"
                    >
                      {t('discontinue')}
                    </button>
                  </div>
                </div>
              )}
            </form>
          </div>
          </div>
        </div>
      )}
      
      {/* Add Stock Modal */}
      {showAddStock && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50" data-testid="add-stock-modal">
          <div className="glass-card w-full max-w-sm p-6 animate-fade-in">
            <h2 className="text-lg font-semibold mb-1">{t('addStock')}</h2>
            <p className="text-sm text-zinc-400 mb-4">{showAddStock.name} — {showAddStock.stock_count} {t('pills')}</p>
            <input
              type="number"
              value={addStockAmount}
              onChange={e => setAddStockAmount(e.target.value)}
              placeholder={t('amount')}
              className="input-field mb-4"
              min="1"
              autoFocus
              data-testid="add-stock-input"
            />
            <div className="flex gap-3">
              <button onClick={() => setShowAddStock(null)} className="btn-secondary flex-1">{t('cancel')}</button>
              <button onClick={submitAddStock} className="btn-primary flex-1" data-testid="confirm-add-stock-btn">{t('add')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
