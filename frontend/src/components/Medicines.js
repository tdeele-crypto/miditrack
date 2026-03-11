import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { 
  Plus, 
  Pill, 
  ThumbsUp, 
  AlertTriangle, 
  Trash2, 
  Edit3,
  X,
  Package
} from 'lucide-react';

export const Medicines = () => {
  const { t, medicines, addMedicine, updateMedicine, deleteMedicine, loading } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [editingMedicine, setEditingMedicine] = useState(null);
  const [showAddStock, setShowAddStock] = useState(null);
  const [addStockAmount, setAddStockAmount] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    dosage: '',
    stock_count: 30,
    reminder_days_before: 7
  });
  
  const resetForm = () => {
    setFormData({
      name: '',
      dosage: '',
      stock_count: 30,
      reminder_days_before: 7
    });
    setEditingMedicine(null);
    setShowForm(false);
  };
  
  const handleEdit = (medicine) => {
    setFormData({
      name: medicine.name,
      dosage: medicine.dosage,
      stock_count: medicine.stock_count,
      reminder_days_before: medicine.reminder_days_before
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
    if (window.confirm(t('confirmDelete'))) {
      try {
        await deleteMedicine(medicineId);
      } catch (err) {
        console.error(err);
      }
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
                <button
                  onClick={() => handleDelete(medicine.medicine_id)}
                  className="btn-danger py-2 px-4"
                  data-testid={`delete-btn-${medicine.medicine_id}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* Add/Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50" data-testid="medicine-form-modal">
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
            </form>
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
