from fastapi import FastAPI, APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import asyncio
import io
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta, date
import hashlib
import secrets
import resend

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Resend setup
resend.api_key = os.environ.get('RESEND_API_KEY', '')
SENDER_EMAIL = os.environ.get('SENDER_EMAIL', 'onboarding@resend.dev')

app = FastAPI()
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ============== MODELS ==============

class UserCreate(BaseModel):
    pin: str
    name: str
    email: EmailStr

class UserLogin(BaseModel):
    user_id: str
    pin: str

class UserResponse(BaseModel):
    user_id: str
    name: str
    email: str
    language: str
    created_at: str

class PinResetRequest(BaseModel):
    email: EmailStr

class PinResetConfirm(BaseModel):
    email: EmailStr
    reset_code: str
    new_pin: str

class MedicineCreate(BaseModel):
    name: str
    dosage: str
    unit: str = "piller"  # piller, stk, enheder
    stock_count: int
    reminder_days_before: int = 7
    start_date: Optional[str] = None
    cancel_date: Optional[str] = None
    end_date: Optional[str] = None
    repeat_interval: Optional[str] = None  # "daily", "weekly", "monthly"

class MedicineUpdate(BaseModel):
    name: Optional[str] = None
    dosage: Optional[str] = None
    unit: Optional[str] = None
    stock_count: Optional[float] = None
    reminder_days_before: Optional[int] = None
    start_date: Optional[str] = None
    cancel_date: Optional[str] = None
    end_date: Optional[str] = None
    repeat_interval: Optional[str] = None

class MedicineResponse(BaseModel):
    medicine_id: str
    user_id: str
    name: str
    dosage: str
    unit: str
    stock_count: float
    reminder_days_before: int
    status: str
    days_until_empty: int
    start_date: Optional[str] = None
    cancel_date: Optional[str] = None
    end_date: Optional[str] = None
    repeat_interval: Optional[str] = None
    created_at: str

class TimeSlotCreate(BaseModel):
    name: str
    time: str
    order: int

class TimeSlotResponse(BaseModel):
    slot_id: str
    user_id: str
    name: str
    time: str
    order: int

class ScheduleEntryCreate(BaseModel):
    medicine_id: str
    slot_id: str
    day_doses: dict
    special_ordination: Optional[dict] = None  # {"start_date": "2026-03-15", "end_date": "2026-06-15", "repeat": "daily"}

class ScheduleEntryResponse(BaseModel):
    entry_id: str
    user_id: str
    medicine_id: str
    medicine_name: str
    medicine_dosage: str
    slot_id: str
    slot_name: str
    slot_time: str
    day_doses: dict
    special_ordination: Optional[dict] = None

class TakeMedicineRequest(BaseModel):
    medicine_id: str
    slot_id: str
    date: str

class MedicineLogResponse(BaseModel):
    log_id: str
    user_id: str
    medicine_id: str
    medicine_name: str
    slot_id: str
    slot_name: str
    taken_at: str
    date: str

class LanguageUpdate(BaseModel):
    language: str

# ============== HELPER FUNCTIONS ==============

def hash_pin(pin: str) -> str:
    return hashlib.sha256(pin.encode()).hexdigest()

def calculate_medicine_status(stock_count: int, daily_pills: float, reminder_days: int) -> tuple:
    if daily_pills == 0:
        return "green", 999
    
    days_until_empty = int(stock_count / daily_pills) if daily_pills > 0 else 999
    
    if days_until_empty <= reminder_days:
        return "red", days_until_empty
    elif days_until_empty <= reminder_days + 14:
        return "yellow", days_until_empty
    else:
        return "green", days_until_empty

def calculate_daily_pills(schedule_entries: list) -> float:
    """Calculate average daily pill consumption from schedule entries including special ordinations."""
    weekly_pills = 0
    special_daily_pills = 0
    
    for entry in schedule_entries:
        # Normal day_doses
        day_doses = entry.get("day_doses", {})
        for day, dose in day_doses.items():
            if isinstance(dose, dict):
                pills = (dose.get("whole", 0) or 0) + (dose.get("half", 0) or 0) * 0.5
                weekly_pills += pills
        
        # Special ordinations
        ord_data = entry.get("special_ordination")
        if ord_data and ord_data.get("start_date"):
            repeat = ord_data.get("repeat", "daily")
            whole = ord_data.get("whole", 1) or 1
            half = ord_data.get("half", 0) or 0
            pills_per_occurrence = whole + half * 0.5
            if repeat == "daily":
                special_daily_pills += pills_per_occurrence
            elif repeat == "weekly":
                special_daily_pills += pills_per_occurrence / 7
            elif repeat == "biweekly":
                special_daily_pills += pills_per_occurrence / 14
            elif repeat == "monthly":
                special_daily_pills += pills_per_occurrence / 30
    
    daily_pills = (weekly_pills / 7) + special_daily_pills
    return daily_pills

# ============== AUTH ENDPOINTS ==============

@api_router.post("/auth/register", response_model=UserResponse)
async def register_user(user: UserCreate):
    existing = await db.users.find_one({"email": user.email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user_id = str(uuid.uuid4())
    user_doc = {
        "user_id": user_id,
        "pin_hash": hash_pin(user.pin),
        "name": user.name,
        "email": user.email,
        "language": "da",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(user_doc)
    
    # Create default time slots
    default_slots = [
        {"slot_id": str(uuid.uuid4()), "user_id": user_id, "name": "Morgen", "name_en": "Morning", "time": "08:00", "order": 1},
        {"slot_id": str(uuid.uuid4()), "user_id": user_id, "name": "Middag", "name_en": "Noon", "time": "12:00", "order": 2},
        {"slot_id": str(uuid.uuid4()), "user_id": user_id, "name": "Aften", "name_en": "Evening", "time": "18:00", "order": 3},
        {"slot_id": str(uuid.uuid4()), "user_id": user_id, "name": "Nat", "name_en": "Night", "time": "22:00", "order": 4},
    ]
    await db.time_slots.insert_many(default_slots)
    
    return UserResponse(
        user_id=user_id,
        name=user.name,
        email=user.email,
        language="da",
        created_at=user_doc["created_at"]
    )

@api_router.post("/auth/login")
async def login_user(login: UserLogin):
    user = await db.users.find_one({"user_id": login.user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if user["pin_hash"] != hash_pin(login.pin):
        raise HTTPException(status_code=401, detail="Invalid PIN")
    
    return {
        "success": True,
        "user_id": user["user_id"],
        "name": user["name"],
        "email": user["email"],
        "language": user.get("language", "da")
    }

class EmailLogin(BaseModel):
    email: EmailStr
    pin: str

@api_router.post("/auth/login-email")
async def login_by_email(data: EmailLogin):
    user = await db.users.find_one({"email": data.email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if user["pin_hash"] != hash_pin(data.pin):
        raise HTTPException(status_code=401, detail="Invalid PIN")
    
    return {
        "success": True,
        "user_id": user["user_id"],
        "name": user["name"],
        "email": user["email"],
        "language": user.get("language", "da")
    }

@api_router.post("/auth/request-pin-reset")
async def request_pin_reset(request: PinResetRequest):
    user = await db.users.find_one({"email": request.email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Email not found")
    
    reset_code = secrets.token_urlsafe(6)[:6].upper()
    expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
    
    await db.pin_resets.update_one(
        {"email": request.email},
        {"$set": {
            "email": request.email,
            "reset_code": reset_code,
            "expires_at": expires_at.isoformat(),
            "used": False
        }},
        upsert=True
    )
    
    if resend.api_key:
        try:
            html_content = f"""
            <div style="font-family: Arial, sans-serif; max-width: 400px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #10b981;">MediTrack PIN Reset</h2>
                <p>Your PIN reset code is:</p>
                <div style="background: #1f2937; color: #10b981; padding: 20px; text-align: center; font-size: 24px; letter-spacing: 4px; border-radius: 8px;">
                    <strong>{reset_code}</strong>
                </div>
                <p style="color: #6b7280; font-size: 12px; margin-top: 20px;">This code expires in 1 hour.</p>
            </div>
            """
            params = {
                "from": SENDER_EMAIL,
                "to": [request.email],
                "subject": "MediTrack - PIN Reset Code",
                "html": html_content
            }
            await asyncio.to_thread(resend.Emails.send, params)
        except Exception as e:
            logger.error(f"Failed to send email: {e}")
    
    return {"success": True, "message": "Reset code sent to email", "code_for_testing": reset_code}

@api_router.post("/auth/confirm-pin-reset")
async def confirm_pin_reset(request: PinResetConfirm):
    reset_doc = await db.pin_resets.find_one({"email": request.email, "used": False}, {"_id": 0})
    if not reset_doc:
        raise HTTPException(status_code=400, detail="No reset request found")
    
    if reset_doc["reset_code"] != request.reset_code:
        raise HTTPException(status_code=400, detail="Invalid reset code")
    
    expires_at = datetime.fromisoformat(reset_doc["expires_at"])
    if datetime.now(timezone.utc) > expires_at:
        raise HTTPException(status_code=400, detail="Reset code expired")
    
    await db.users.update_one(
        {"email": request.email},
        {"$set": {"pin_hash": hash_pin(request.new_pin)}}
    )
    await db.pin_resets.update_one(
        {"email": request.email},
        {"$set": {"used": True}}
    )
    
    user = await db.users.find_one({"email": request.email}, {"_id": 0})
    return {"success": True, "user_id": user["user_id"]}

@api_router.get("/auth/user/{user_id}", response_model=UserResponse)
async def get_user(user_id: str):
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return UserResponse(
        user_id=user["user_id"],
        name=user["name"],
        email=user["email"],
        language=user.get("language", "da"),
        created_at=user["created_at"]
    )

@api_router.put("/auth/user/{user_id}/language")
async def update_language(user_id: str, update: LanguageUpdate):
    result = await db.users.update_one(
        {"user_id": user_id},
        {"$set": {"language": update.language}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"success": True, "language": update.language}

# ============== MEDICINE ENDPOINTS ==============

@api_router.post("/medicines/{user_id}", response_model=MedicineResponse)
async def create_medicine(user_id: str, medicine: MedicineCreate):
    # Calculate daily pills from schedule
    schedule_entries = await db.schedule_entries.find({"user_id": user_id}).to_list(100)
    daily_pills = 0
    # Will be recalculated when schedule is added
    
    status, days_until_empty = calculate_medicine_status(
        medicine.stock_count, daily_pills, medicine.reminder_days_before
    )
    
    medicine_id = str(uuid.uuid4())
    medicine_doc = {
        "medicine_id": medicine_id,
        "user_id": user_id,
        "name": medicine.name,
        "dosage": medicine.dosage,
        "unit": medicine.unit,
        "stock_count": medicine.stock_count,
        "reminder_days_before": medicine.reminder_days_before,
        "start_date": medicine.start_date,
        "cancel_date": medicine.cancel_date,
        "end_date": medicine.end_date,
        "repeat_interval": medicine.repeat_interval,
        "stock_updated_at": datetime.now(timezone.utc).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.medicines.insert_one(medicine_doc)
    
    return MedicineResponse(
        medicine_id=medicine_id,
        user_id=user_id,
        name=medicine.name,
        dosage=medicine.dosage,
        unit=medicine.unit,
        stock_count=medicine.stock_count,
        reminder_days_before=medicine.reminder_days_before,
        status=status,
        days_until_empty=days_until_empty,
        start_date=medicine.start_date,
        cancel_date=medicine.cancel_date,
        end_date=medicine.end_date,
        repeat_interval=medicine.repeat_interval,
        created_at=medicine_doc["created_at"]
    )

@api_router.get("/medicines/{user_id}", response_model=List[MedicineResponse])
async def get_medicines(user_id: str):
    medicines = await db.medicines.find({"user_id": user_id}, {"_id": 0}).to_list(100)
    result = []
    
    for med in medicines:
        schedule_entries = await db.schedule_entries.find(
            {"user_id": user_id, "medicine_id": med["medicine_id"]}, {"_id": 0}
        ).to_list(100)
        
        daily_pills = calculate_daily_pills(schedule_entries)
        
        status, days_until_empty = calculate_medicine_status(
            med["stock_count"], daily_pills, med["reminder_days_before"]
        )
        
        result.append(MedicineResponse(
            medicine_id=med["medicine_id"],
            user_id=med["user_id"],
            name=med["name"],
            dosage=med["dosage"],
            unit=med.get("unit", "piller"),
            stock_count=med["stock_count"],
            reminder_days_before=med["reminder_days_before"],
            status=status,
            days_until_empty=days_until_empty,
            start_date=med.get("start_date"),
            cancel_date=med.get("cancel_date"),
            end_date=med.get("end_date"),
            repeat_interval=med.get("repeat_interval"),
            created_at=med["created_at"]
        ))
    
    return result

@api_router.put("/medicines/{user_id}/{medicine_id}", response_model=MedicineResponse)
async def update_medicine(user_id: str, medicine_id: str, update: MedicineUpdate):
    update_dict = {}
    for k, v in update.model_dump().items():
        if v is not None:
            update_dict[k] = v
        elif k in ("cancel_date", "end_date", "repeat_interval", "start_date"):
            update_dict[k] = None
    if not update_dict:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    # Reset stock_updated_at when stock_count changes
    if "stock_count" in update_dict:
        update_dict["stock_updated_at"] = datetime.now(timezone.utc).isoformat()
    
    result = await db.medicines.update_one(
        {"user_id": user_id, "medicine_id": medicine_id},
        {"$set": update_dict}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Medicine not found")
    
    med = await db.medicines.find_one({"medicine_id": medicine_id}, {"_id": 0})
    schedule_entries = await db.schedule_entries.find(
        {"user_id": user_id, "medicine_id": medicine_id}, {"_id": 0}
    ).to_list(100)
    
    daily_pills = calculate_daily_pills(schedule_entries)
    
    status, days_until_empty = calculate_medicine_status(
        med["stock_count"], daily_pills, med["reminder_days_before"]
    )
    
    return MedicineResponse(
        medicine_id=med["medicine_id"],
        user_id=med["user_id"],
        name=med["name"],
        dosage=med["dosage"],
        unit=med.get("unit", "piller"),
        stock_count=med["stock_count"],
        reminder_days_before=med["reminder_days_before"],
        status=status,
        days_until_empty=days_until_empty,
        start_date=med.get("start_date"),
        cancel_date=med.get("cancel_date"),
        end_date=med.get("end_date"),
        repeat_interval=med.get("repeat_interval"),
        created_at=med["created_at"]
    )

@api_router.delete("/medicines/{user_id}/{medicine_id}")
async def delete_medicine(user_id: str, medicine_id: str):
    result = await db.medicines.delete_one({"user_id": user_id, "medicine_id": medicine_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Medicine not found")
    
    await db.schedule_entries.delete_many({"user_id": user_id, "medicine_id": medicine_id})
    return {"success": True}

# ============== TIME SLOTS ENDPOINTS ==============

@api_router.get("/timeslots/{user_id}", response_model=List[TimeSlotResponse])
async def get_time_slots(user_id: str):
    slots = await db.time_slots.find({"user_id": user_id}, {"_id": 0}).sort("order", 1).to_list(10)
    return [TimeSlotResponse(**slot) for slot in slots]

@api_router.put("/timeslots/{user_id}/{slot_id}")
async def update_time_slot(user_id: str, slot_id: str, update: TimeSlotCreate):
    result = await db.time_slots.update_one(
        {"user_id": user_id, "slot_id": slot_id},
        {"$set": {"name": update.name, "time": update.time, "order": update.order}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Time slot not found")
    return {"success": True}

# ============== SCHEDULE ENDPOINTS ==============

@api_router.post("/schedule/{user_id}", response_model=ScheduleEntryResponse)
async def create_schedule_entry(user_id: str, entry: ScheduleEntryCreate):
    medicine = await db.medicines.find_one({"medicine_id": entry.medicine_id, "user_id": user_id}, {"_id": 0})
    if not medicine:
        raise HTTPException(status_code=404, detail="Medicine not found")
    
    slot = await db.time_slots.find_one({"slot_id": entry.slot_id, "user_id": user_id}, {"_id": 0})
    if not slot:
        raise HTTPException(status_code=404, detail="Time slot not found")
    
    existing = await db.schedule_entries.find_one({
        "user_id": user_id, "medicine_id": entry.medicine_id, "slot_id": entry.slot_id
    }, {"_id": 0})
    
    if existing:
        await db.schedule_entries.update_one(
            {"entry_id": existing["entry_id"]},
            {"$set": {"day_doses": entry.day_doses, "special_ordination": entry.special_ordination}}
        )
        entry_id = existing["entry_id"]
    else:
        entry_id = str(uuid.uuid4())
        entry_doc = {
            "entry_id": entry_id,
            "user_id": user_id,
            "medicine_id": entry.medicine_id,
            "slot_id": entry.slot_id,
            "day_doses": entry.day_doses,
            "special_ordination": entry.special_ordination
        }
        await db.schedule_entries.insert_one(entry_doc)
    
    return ScheduleEntryResponse(
        entry_id=entry_id,
        user_id=user_id,
        medicine_id=entry.medicine_id,
        medicine_name=medicine["name"],
        medicine_dosage=medicine["dosage"],
        slot_id=entry.slot_id,
        slot_name=slot["name"],
        slot_time=slot["time"],
        day_doses=entry.day_doses,
        special_ordination=entry.special_ordination
    )

@api_router.get("/schedule/{user_id}", response_model=List[ScheduleEntryResponse])
async def get_schedule(user_id: str):
    entries = await db.schedule_entries.find({"user_id": user_id}, {"_id": 0}).to_list(100)
    result = []
    
    for entry in entries:
        medicine = await db.medicines.find_one({"medicine_id": entry["medicine_id"]}, {"_id": 0})
        slot = await db.time_slots.find_one({"slot_id": entry["slot_id"]}, {"_id": 0})
        
        if medicine and slot:
            # Handle old format (days + pills_whole/half) and new format (day_doses)
            day_doses = entry.get("day_doses")
            if not day_doses and "days" in entry:
                # Convert old format to new
                pills_whole = entry.get("pills_whole", 1)
                pills_half = entry.get("pills_half", 0)
                day_doses = {day: {"whole": pills_whole, "half": pills_half} for day in entry["days"]}
            
            result.append(ScheduleEntryResponse(
                entry_id=entry["entry_id"],
                user_id=entry["user_id"],
                medicine_id=entry["medicine_id"],
                medicine_name=medicine["name"],
                medicine_dosage=medicine["dosage"],
                slot_id=entry["slot_id"],
                slot_name=slot["name"],
                slot_time=slot["time"],
                day_doses=day_doses or {},
                special_ordination=entry.get("special_ordination")
            ))
    
    return result

@api_router.delete("/schedule/{user_id}/{entry_id}")
async def delete_schedule_entry(user_id: str, entry_id: str):
    result = await db.schedule_entries.delete_one({"user_id": user_id, "entry_id": entry_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Schedule entry not found")
    return {"success": True}

class ScheduleEntryUpdate(BaseModel):
    day_doses: Optional[dict] = None
    special_ordination: Optional[dict] = None

@api_router.put("/schedule/{user_id}/{entry_id}", response_model=ScheduleEntryResponse)
async def update_schedule_entry(user_id: str, entry_id: str, update: ScheduleEntryUpdate):
    entry = await db.schedule_entries.find_one({"user_id": user_id, "entry_id": entry_id}, {"_id": 0})
    if not entry:
        raise HTTPException(status_code=404, detail="Schedule entry not found")
    
    update_fields = {}
    if update.day_doses is not None:
        update_fields["day_doses"] = update.day_doses
    if update.special_ordination is not None:
        update_fields["special_ordination"] = update.special_ordination
    
    if not update_fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    await db.schedule_entries.update_one(
        {"entry_id": entry_id},
        {"$set": update_fields}
    )
    
    updated_entry = await db.schedule_entries.find_one({"entry_id": entry_id}, {"_id": 0})
    medicine = await db.medicines.find_one({"medicine_id": updated_entry["medicine_id"]}, {"_id": 0})
    slot = await db.time_slots.find_one({"slot_id": updated_entry["slot_id"]}, {"_id": 0})
    
    return ScheduleEntryResponse(
        entry_id=entry_id,
        user_id=user_id,
        medicine_id=updated_entry["medicine_id"],
        medicine_name=medicine["name"],
        medicine_dosage=medicine["dosage"],
        slot_id=updated_entry["slot_id"],
        slot_name=slot["name"],
        slot_time=slot["time"],
        day_doses=updated_entry.get("day_doses", {}),
        special_ordination=updated_entry.get("special_ordination")
    )

# ============== MEDICINE LOG ENDPOINTS ==============

@api_router.post("/log/{user_id}", response_model=MedicineLogResponse)
async def take_medicine(user_id: str, request: TakeMedicineRequest):
    medicine = await db.medicines.find_one({"medicine_id": request.medicine_id, "user_id": user_id}, {"_id": 0})
    if not medicine:
        raise HTTPException(status_code=404, detail="Medicine not found")
    
    slot = await db.time_slots.find_one({"slot_id": request.slot_id, "user_id": user_id}, {"_id": 0})
    if not slot:
        raise HTTPException(status_code=404, detail="Time slot not found")
    
    # Get pills per dose from schedule entry for this specific day
    schedule_entry = await db.schedule_entries.find_one({
        "user_id": user_id, "medicine_id": request.medicine_id, "slot_id": request.slot_id
    }, {"_id": 0})
    
    pills_per_dose = 1.0
    if schedule_entry:
        day_doses = schedule_entry.get("day_doses", {})
        # Get day from date (mon, tue, wed, etc.)
        from datetime import datetime
        date_obj = datetime.strptime(request.date, "%Y-%m-%d")
        day_keys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
        day_key = day_keys[date_obj.weekday()]
        
        if day_key in day_doses:
            dose = day_doses[day_key]
            pills_per_dose = dose.get("whole", 0) + dose.get("half", 0) * 0.5
        elif "days" in schedule_entry:
            # Old format fallback
            pills_per_dose = schedule_entry.get("pills_whole", 1) + schedule_entry.get("pills_half", 0) * 0.5
    
    existing_log = await db.medicine_logs.find_one({
        "user_id": user_id,
        "medicine_id": request.medicine_id,
        "slot_id": request.slot_id,
        "date": request.date
    }, {"_id": 0})
    
    if existing_log:
        raise HTTPException(status_code=400, detail="Already logged for this time")
    
    new_stock = medicine["stock_count"] - pills_per_dose
    if new_stock < 0:
        new_stock = 0
    
    await db.medicines.update_one(
        {"medicine_id": request.medicine_id},
        {"$set": {"stock_count": new_stock, "stock_updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    log_id = str(uuid.uuid4())
    log_doc = {
        "log_id": log_id,
        "user_id": user_id,
        "medicine_id": request.medicine_id,
        "slot_id": request.slot_id,
        "pills_taken": pills_per_dose,
        "taken_at": datetime.now(timezone.utc).isoformat(),
        "date": request.date
    }
    await db.medicine_logs.insert_one(log_doc)
    
    return MedicineLogResponse(
        log_id=log_id,
        user_id=user_id,
        medicine_id=request.medicine_id,
        medicine_name=medicine["name"],
        slot_id=request.slot_id,
        slot_name=slot["name"],
        taken_at=log_doc["taken_at"],
        date=request.date
    )

@api_router.get("/log/{user_id}")
async def get_medicine_logs(user_id: str, date: Optional[str] = None):
    query = {"user_id": user_id}
    if date:
        query["date"] = date
    
    logs = await db.medicine_logs.find(query, {"_id": 0}).to_list(1000)
    result = []
    
    for log in logs:
        medicine = await db.medicines.find_one({"medicine_id": log["medicine_id"]}, {"_id": 0})
        slot = await db.time_slots.find_one({"slot_id": log["slot_id"]}, {"_id": 0})
        
        if medicine and slot:
            result.append(MedicineLogResponse(
                log_id=log["log_id"],
                user_id=log["user_id"],
                medicine_id=log["medicine_id"],
                medicine_name=medicine["name"],
                slot_id=log["slot_id"],
                slot_name=slot["name"],
                taken_at=log["taken_at"],
                date=log["date"]
            ))
    
    return result

@api_router.delete("/log/{user_id}/{log_id}")
async def undo_take_medicine(user_id: str, log_id: str):
    log = await db.medicine_logs.find_one({"user_id": user_id, "log_id": log_id}, {"_id": 0})
    if not log:
        raise HTTPException(status_code=404, detail="Log not found")
    
    pills_taken = log.get("pills_taken", 1.0)
    
    await db.medicines.update_one(
        {"medicine_id": log["medicine_id"]},
        {"$inc": {"stock_count": pills_taken}}
    )
    
    await db.medicine_logs.delete_one({"log_id": log_id})
    return {"success": True}

# ============== CRON ENDPOINTS ==============

@api_router.get("/cron/update-stocks")
async def cron_update_stocks():
    """Nightly cron job: deduct one day of medicine consumption for all users.
    Called by system cron at 23:00. Handles catch-up if days were missed."""
    now = datetime.now(timezone.utc)
    users = await db.users.find({}, {"_id": 0, "user_id": 1}).to_list(10000)
    total_updated = 0
    errors = []
    user_alerts = {}  # {user_id: [{"name", "dosage", "stock", "unit", "days_left", "status"}]}

    for user in users:
        uid = user["user_id"]
        medicines = await db.medicines.find({"user_id": uid}, {"_id": 0}).to_list(500)

        for med in medicines:
            try:
                entries = await db.schedule_entries.find(
                    {"user_id": uid, "medicine_id": med["medicine_id"]}, {"_id": 0}
                ).to_list(100)
                daily_pills = calculate_daily_pills(entries)
                if daily_pills <= 0:
                    continue

                stock = med["stock_count"]
                last_updated = med.get("stock_updated_at")

                if last_updated:
                    last_dt = datetime.fromisoformat(last_updated) if isinstance(last_updated, str) else last_updated
                    if last_dt.tzinfo is None:
                        last_dt = last_dt.replace(tzinfo=timezone.utc)
                    days_passed = max(1, int((now - last_dt).total_seconds() / 86400))
                else:
                    days_passed = 1

                pills_consumed = daily_pills * days_passed
                new_stock = round(max(0, stock - pills_consumed), 1)

                await db.medicines.update_one(
                    {"medicine_id": med["medicine_id"]},
                    {"$set": {"stock_count": new_stock, "stock_updated_at": now.isoformat()}}
                )
                total_updated += 1

                # Track low-stock medicines for email notification
                status, days_until_empty = calculate_medicine_status(
                    new_stock, daily_pills, med["reminder_days_before"]
                )
                if status in ("yellow", "red"):
                    unit = med.get("unit", "piller")
                    if uid not in user_alerts:
                        user_alerts[uid] = []
                    user_alerts[uid].append({
                        "name": med["name"],
                        "dosage": med.get("dosage", ""),
                        "stock": new_stock,
                        "unit": unit,
                        "days_left": days_until_empty,
                        "status": status
                    })

            except Exception as e:
                errors.append(f"{med.get('name', med['medicine_id'])}: {str(e)}")

    # Send email notifications for users with low-stock medicines
    emails_sent = 0
    if resend.api_key:
        for uid, alerts in user_alerts.items():
            try:
                u = await db.users.find_one({"user_id": uid}, {"_id": 0})
                if not u or not u.get("email"):
                    continue
                lang = u.get("language", "da")
                is_da = lang == "da"

                # Build HTML email
                rows_html = ""
                for a in alerts:
                    color = "#ef4444" if a["status"] == "red" else "#f59e0b"
                    status_text = ("Bestil snart" if a["status"] == "red" else "Lavt lager") if is_da else ("Order soon" if a["status"] == "red" else "Low stock")
                    rows_html += f"""
                    <tr>
                        <td style="padding:8px 12px;border-bottom:1px solid #374151;">{a['name']}<br><span style="color:#9ca3af;font-size:12px;">{a['dosage']}</span></td>
                        <td style="padding:8px 12px;border-bottom:1px solid #374151;text-align:center;">{a['stock']} {a['unit']}</td>
                        <td style="padding:8px 12px;border-bottom:1px solid #374151;text-align:center;">{a['days_left']} {'dage' if is_da else 'days'}</td>
                        <td style="padding:8px 12px;border-bottom:1px solid #374151;text-align:center;"><span style="color:{color};font-weight:bold;">{status_text}</span></td>
                    </tr>"""

                subject = "MediTrack - Lavt lager påmindelse" if is_da else "MediTrack - Low Stock Reminder"
                th_medicine = "Medicin" if is_da else "Medicine"
                th_stock = "Lager" if is_da else "Stock"
                th_days = "Dage tilbage" if is_da else "Days left"
                th_status = "Status" if is_da else "Status"
                greeting = f"Hej {u.get('name', '')}," if is_da else f"Hi {u.get('name', '')},"
                intro = "Følgende mediciner er ved at løbe tør:" if is_da else "The following medicines are running low:"

                html = f"""
                <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#111827;color:#e5e7eb;border-radius:12px;">
                    <h2 style="color:#10b981;margin-bottom:4px;">MediTrack</h2>
                    <p>{greeting}</p>
                    <p>{intro}</p>
                    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
                        <tr style="background:#1f2937;">
                            <th style="padding:8px 12px;text-align:left;color:#10b981;">{th_medicine}</th>
                            <th style="padding:8px 12px;text-align:center;color:#10b981;">{th_stock}</th>
                            <th style="padding:8px 12px;text-align:center;color:#10b981;">{th_days}</th>
                            <th style="padding:8px 12px;text-align:center;color:#10b981;">{th_status}</th>
                        </tr>
                        {rows_html}
                    </table>
                    <p style="color:#6b7280;font-size:12px;margin-top:20px;">{'Automatisk besked fra MediTrack' if is_da else 'Automatic message from MediTrack'}</p>
                </div>
                """

                params = {
                    "from": SENDER_EMAIL,
                    "to": [u["email"]],
                    "subject": subject,
                    "html": html
                }
                await asyncio.to_thread(resend.Emails.send, params)
                emails_sent += 1
                logger.info(f"Low stock email sent to {u['email']} ({len(alerts)} medicines)")
            except Exception as e:
                logger.error(f"Failed to send stock alert email to user {uid}: {e}")

    return {
        "success": True,
        "users_processed": len(users),
        "medicines_updated": total_updated,
        "emails_sent": emails_sent,
        "errors": errors,
        "timestamp": now.isoformat()
    }

# ============== HEALTH CHECK ==============

@api_router.get("/")
async def root():
    return {"message": "MediTrack API", "version": "1.0.0"}

@api_router.get("/health")
async def health_check():
    return {"status": "healthy"}

# Include router and middleware

# --- PDF Generation Endpoint ---
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

def _is_ordination_active(ord_data, check_date):
    if not ord_data or not ord_data.get('start_date'):
        return False
    start = datetime.strptime(str(ord_data['start_date'])[:10], '%Y-%m-%d').date()
    if check_date < start:
        return False
    if ord_data.get('end_date'):
        end = datetime.strptime(str(ord_data['end_date'])[:10], '%Y-%m-%d').date()
        if check_date > end:
            return False
    repeat = ord_data.get('repeat', '')
    days_diff = (check_date - start).days
    if repeat == 'daily':
        return True
    elif repeat == 'weekly':
        return check_date.weekday() == start.weekday()
    elif repeat == 'biweekly':
        return check_date.weekday() == start.weekday() and (days_diff // 7) % 2 == 0
    elif repeat == 'monthly':
        return check_date.day == start.day
    return days_diff == 0

async def _build_pdf_bytes(user_id: str, week_offset: int = 0, lang: str = "da"):
    """Generate PDF bytes for a user's schedule."""
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    today = date.today()
    # Monday of current week + offset
    monday = today - timedelta(days=today.weekday()) + timedelta(weeks=week_offset)
    week_dates = [monday + timedelta(days=i) for i in range(7)]
    import datetime as dt_module
    week_num = monday.isocalendar()[1]

    day_keys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
    day_names_da = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn']
    day_names_en = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    day_names = day_names_da if lang == 'da' else day_names_en

    slots = await db.time_slots.find({"user_id": user_id}, {"_id": 0}).sort("order", 1).to_list(100)
    entries = await db.schedule_entries.find({"user_id": user_id}, {"_id": 0}).to_list(500)
    meds_list = await db.medicines.find({"user_id": user_id}, {"_id": 0}).to_list(500)
    meds_map = {m['medicine_id']: m for m in meds_list}

    buffer = io.BytesIO()
    page_w, page_h = landscape(A4)
    doc = SimpleDocTemplate(buffer, pagesize=landscape(A4), leftMargin=15*mm, rightMargin=15*mm, topMargin=15*mm, bottomMargin=10*mm)
    styles = getSampleStyleSheet()
    elements = []

    title_text = f"{'UGESKEMA' if lang == 'da' else 'WEEKLY SCHEDULE'} - {'Uge' if lang == 'da' else 'Week'} {week_num}"
    elements.append(Paragraph(title_text, ParagraphStyle('Title', parent=styles['Title'], fontSize=18, textColor=colors.HexColor('#10b981'))))
    elements.append(Paragraph(user.get('name', ''), styles['Normal']))
    date_range = f"{week_dates[0].strftime('%d/%m')} - {week_dates[6].strftime('%d/%m/%Y')}"
    elements.append(Paragraph(date_range, ParagraphStyle('DateRange', parent=styles['Normal'], fontSize=9, textColor=colors.grey)))
    elements.append(Spacer(1, 6*mm))

    col_widths = [45*mm] + [((page_w - 30*mm - 45*mm) / 7)] * 7
    med_style = ParagraphStyle('MedName', parent=styles['Normal'], fontSize=8, leading=10)
    cell_style = ParagraphStyle('Cell', parent=styles['Normal'], fontSize=10, alignment=1, leading=12)
    cell_mg = ParagraphStyle('CellMg', parent=styles['Normal'], fontSize=7, alignment=1, textColor=colors.HexColor('#10b981'))

    for slot in slots:
        slot_entries = [e for e in entries if e.get('slot_id') == slot['slot_id']]
        if not slot_entries:
            continue

        # Slot header
        header_data = [[Paragraph(f"<b>{slot['name']} ({slot['time']})</b>", ParagraphStyle('SlotH', parent=styles['Normal'], fontSize=10, textColor=colors.white))] + [''] * 7]
        ht = Table(header_data, colWidths=col_widths)
        ht.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#10b981')),
            ('SPAN', (0, 0), (-1, 0)),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ]))
        elements.append(ht)

        # Day headers
        day_header = [Paragraph(f"<b>{'Medicin' if lang == 'da' else 'Medicine'}</b>", med_style)]
        for i, dn in enumerate(day_names):
            day_header.append(Paragraph(f"<b>{dn}</b><br/><font size=7>{week_dates[i].strftime('%d/%m')}</font>", ParagraphStyle('DH', parent=styles['Normal'], fontSize=9, alignment=1, leading=11)))
        dh_table = Table([day_header], colWidths=col_widths)
        dh_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f0f0f0')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.black),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cccccc')),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 0), (-1, -1), 2),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
        ]))
        elements.append(dh_table)

        rows = []
        for entry in slot_entries:
            med = meds_map.get(entry.get('medicine_id'), {})
            med_name = med.get('name', entry.get('medicine_name', '?'))
            med_dosage = med.get('dosage', entry.get('medicine_dosage', ''))
            import re
            dosage_search = re.search(r'(\d+(?:[.,]\d+)?)\s*(mg|g|mcg|µg)', med_dosage, re.I)
            dosage_per_pill = None
            dosage_unit = None
            if dosage_search:
                dosage_per_pill = float(dosage_search.group(1).replace(',', '.'))
                dosage_unit = dosage_search.group(2)

            row = [Paragraph(f"<b>{med_name}</b><br/><font size=7 color='grey'>{med_dosage}</font>", med_style)]
            for i, dk in enumerate(day_keys):
                day_doses = entry.get('day_doses') or {}
                if not day_doses and isinstance(entry.get('days'), dict):
                    day_doses = entry['days']
                dose = day_doses.get(dk)
                if not dose and entry.get('special_ordination') and _is_ordination_active(entry['special_ordination'], week_dates[i]):
                    ord = entry['special_ordination']
                    dose = {'whole': ord.get('whole', 1) or 1, 'half': ord.get('half', 0) or 0}
                if dose and ((dose.get('whole', 0) or 0) > 0 or (dose.get('half', 0) or 0) > 0):
                    w = dose.get('whole', 0) or 0
                    h = dose.get('half', 0) or 0
                    pills_str = ''
                    if w > 0 and h > 0: pills_str = f"{w}½"
                    elif h > 0: pills_str = "½" if h == 1 else f"{h}×½"
                    else: pills_str = str(w)
                    total = w + h * 0.5
                    dosage_str = ''
                    if dosage_per_pill:
                        dosage_val = dosage_per_pill * total
                        dosage_str = f"{int(dosage_val)}{dosage_unit}" if dosage_val == int(dosage_val) else f"{dosage_val:.1f}{dosage_unit}"
                    cell_content = f"<b>{pills_str}</b>"
                    if dosage_str:
                        cell_content += f"<br/><font size=7 color='#10b981'>{dosage_str}</font>"
                    row.append(Paragraph(cell_content, cell_style))
                else:
                    row.append(Paragraph("<font color='#cccccc'>-</font>", cell_style))
            rows.append(row)

        if rows:
            t = Table(rows, colWidths=col_widths)
            t.setStyle(TableStyle([
                ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cccccc')),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('TOPPADDING', (0, 0), (-1, -1), 4),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
                ('ROWBACKGROUNDS', (0, 0), (-1, -1), [colors.white, colors.HexColor('#fafafa')]),
            ]))
            elements.append(t)
        elements.append(Spacer(1, 4*mm))

    elements.append(Spacer(1, 3*mm))
    elements.append(Paragraph("MediTrack", ParagraphStyle('Footer', parent=styles['Normal'], fontSize=8, textColor=colors.grey)))

    doc.build(elements)
    buffer.seek(0)
    week_num_val = week_num
    return buffer, week_num_val, user

@api_router.get("/schedule/{user_id}/pdf")
async def generate_schedule_pdf(user_id: str, week_offset: int = 0, lang: str = "da"):
    buffer, week_num, user = await _build_pdf_bytes(user_id, week_offset, lang)
    filename = f"ugeskema_uge{week_num}.pdf"
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

class EmailPdfRequest(BaseModel):
    week_offset: int = 0
    lang: str = "da"

@api_router.post("/schedule/{user_id}/email-pdf")
async def email_schedule_pdf(user_id: str, request: EmailPdfRequest):
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not user.get('email'):
        raise HTTPException(status_code=400, detail="No email on file")
    
    buffer, week_num, _ = await _build_pdf_bytes(user_id, request.week_offset, request.lang)
    pdf_bytes = buffer.read()
    
    import base64
    pdf_b64 = base64.b64encode(pdf_bytes).decode('utf-8')
    filename = f"ugeskema_uge{week_num}.pdf"
    
    subject = f"MediTrack - {'Ugeskema Uge' if request.lang == 'da' else 'Weekly Schedule Week'} {week_num}"
    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #10b981;">MediTrack</h2>
        <p>{'Dit ugeskema er vedhæftet som PDF.' if request.lang == 'da' else 'Your weekly schedule is attached as PDF.'}</p>
        <p style="color: #6b7280; font-size: 12px;">{'Uge' if request.lang == 'da' else 'Week'} {week_num} - {user.get('name', '')}</p>
    </div>
    """
    
    if not resend.api_key:
        raise HTTPException(status_code=500, detail="Email not configured")
    
    try:
        params = {
            "from": SENDER_EMAIL,
            "to": [user['email']],
            "subject": subject,
            "html": html,
            "attachments": [{"filename": filename, "content": pdf_b64}]
        }
        await asyncio.to_thread(resend.Emails.send, params)
        return {"success": True, "message": f"PDF sent to {user['email']}"}
    except Exception as e:
        logger.error(f"Failed to send PDF email: {e}")
        raise HTTPException(status_code=500, detail=str(e))


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
