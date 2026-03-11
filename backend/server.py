from fastapi import FastAPI, APIRouter, HTTPException, Depends
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import asyncio
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
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
    stock_count: int
    reminder_days_before: int = 7

class MedicineUpdate(BaseModel):
    name: Optional[str] = None
    dosage: Optional[str] = None
    stock_count: Optional[float] = None
    reminder_days_before: Optional[int] = None

class MedicineResponse(BaseModel):
    medicine_id: str
    user_id: str
    name: str
    dosage: str
    stock_count: float
    reminder_days_before: int
    status: str
    days_until_empty: int
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
    days: List[str]
    pills_whole: int = 1
    pills_half: int = 0

class ScheduleEntryResponse(BaseModel):
    entry_id: str
    user_id: str
    medicine_id: str
    medicine_name: str
    slot_id: str
    slot_name: str
    slot_time: str
    days: List[str]
    pills_whole: int
    pills_half: int
    pills_per_dose: float

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
        "stock_count": medicine.stock_count,
        "reminder_days_before": medicine.reminder_days_before,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.medicines.insert_one(medicine_doc)
    
    return MedicineResponse(
        medicine_id=medicine_id,
        user_id=user_id,
        name=medicine.name,
        dosage=medicine.dosage,
        stock_count=medicine.stock_count,
        reminder_days_before=medicine.reminder_days_before,
        status=status,
        days_until_empty=days_until_empty,
        created_at=medicine_doc["created_at"]
    )

@api_router.get("/medicines/{user_id}", response_model=List[MedicineResponse])
async def get_medicines(user_id: str):
    medicines = await db.medicines.find({"user_id": user_id}, {"_id": 0}).to_list(100)
    result = []
    
    for med in medicines:
        # Calculate daily pills from schedule entries for this medicine
        schedule_entries = await db.schedule_entries.find(
            {"user_id": user_id, "medicine_id": med["medicine_id"]}, {"_id": 0}
        ).to_list(100)
        
        daily_pills = 0
        for entry in schedule_entries:
            pills_per_dose = entry.get("pills_whole", 1) + entry.get("pills_half", 0) * 0.5
            doses_per_week = len(entry.get("days", []))
            daily_pills += (pills_per_dose * doses_per_week) / 7
        
        status, days_until_empty = calculate_medicine_status(
            med["stock_count"], daily_pills, med["reminder_days_before"]
        )
        
        result.append(MedicineResponse(
            medicine_id=med["medicine_id"],
            user_id=med["user_id"],
            name=med["name"],
            dosage=med["dosage"],
            stock_count=med["stock_count"],
            reminder_days_before=med["reminder_days_before"],
            status=status,
            days_until_empty=days_until_empty,
            created_at=med["created_at"]
        ))
    
    return result

@api_router.put("/medicines/{user_id}/{medicine_id}", response_model=MedicineResponse)
async def update_medicine(user_id: str, medicine_id: str, update: MedicineUpdate):
    update_dict = {k: v for k, v in update.model_dump().items() if v is not None}
    if not update_dict:
        raise HTTPException(status_code=400, detail="No fields to update")
    
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
    
    daily_pills = 0
    for entry in schedule_entries:
        pills_per_dose = entry.get("pills_whole", 1) + entry.get("pills_half", 0) * 0.5
        doses_per_week = len(entry.get("days", []))
        daily_pills += (pills_per_dose * doses_per_week) / 7
    
    status, days_until_empty = calculate_medicine_status(
        med["stock_count"], daily_pills, med["reminder_days_before"]
    )
    
    return MedicineResponse(
        medicine_id=med["medicine_id"],
        user_id=med["user_id"],
        name=med["name"],
        dosage=med["dosage"],
        stock_count=med["stock_count"],
        reminder_days_before=med["reminder_days_before"],
        status=status,
        days_until_empty=days_until_empty,
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
    
    pills_per_dose = entry.pills_whole + entry.pills_half * 0.5
    
    existing = await db.schedule_entries.find_one({
        "user_id": user_id, "medicine_id": entry.medicine_id, "slot_id": entry.slot_id
    }, {"_id": 0})
    
    if existing:
        await db.schedule_entries.update_one(
            {"entry_id": existing["entry_id"]},
            {"$set": {"days": entry.days, "pills_whole": entry.pills_whole, "pills_half": entry.pills_half}}
        )
        entry_id = existing["entry_id"]
    else:
        entry_id = str(uuid.uuid4())
        entry_doc = {
            "entry_id": entry_id,
            "user_id": user_id,
            "medicine_id": entry.medicine_id,
            "slot_id": entry.slot_id,
            "days": entry.days,
            "pills_whole": entry.pills_whole,
            "pills_half": entry.pills_half
        }
        await db.schedule_entries.insert_one(entry_doc)
    
    return ScheduleEntryResponse(
        entry_id=entry_id,
        user_id=user_id,
        medicine_id=entry.medicine_id,
        medicine_name=medicine["name"],
        slot_id=entry.slot_id,
        slot_name=slot["name"],
        slot_time=slot["time"],
        days=entry.days,
        pills_whole=entry.pills_whole,
        pills_half=entry.pills_half,
        pills_per_dose=pills_per_dose
    )

@api_router.get("/schedule/{user_id}", response_model=List[ScheduleEntryResponse])
async def get_schedule(user_id: str):
    entries = await db.schedule_entries.find({"user_id": user_id}, {"_id": 0}).to_list(100)
    result = []
    
    for entry in entries:
        medicine = await db.medicines.find_one({"medicine_id": entry["medicine_id"]}, {"_id": 0})
        slot = await db.time_slots.find_one({"slot_id": entry["slot_id"]}, {"_id": 0})
        
        if medicine and slot:
            pills_whole = entry.get("pills_whole", 1)
            pills_half = entry.get("pills_half", 0)
            pills_per_dose = pills_whole + pills_half * 0.5
            
            result.append(ScheduleEntryResponse(
                entry_id=entry["entry_id"],
                user_id=entry["user_id"],
                medicine_id=entry["medicine_id"],
                medicine_name=medicine["name"],
                slot_id=entry["slot_id"],
                slot_name=slot["name"],
                slot_time=slot["time"],
                days=entry["days"],
                pills_whole=pills_whole,
                pills_half=pills_half,
                pills_per_dose=pills_per_dose
            ))
    
    return result

@api_router.delete("/schedule/{user_id}/{entry_id}")
async def delete_schedule_entry(user_id: str, entry_id: str):
    result = await db.schedule_entries.delete_one({"user_id": user_id, "entry_id": entry_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Schedule entry not found")
    return {"success": True}

# ============== MEDICINE LOG ENDPOINTS ==============

@api_router.post("/log/{user_id}", response_model=MedicineLogResponse)
async def take_medicine(user_id: str, request: TakeMedicineRequest):
    medicine = await db.medicines.find_one({"medicine_id": request.medicine_id, "user_id": user_id}, {"_id": 0})
    if not medicine:
        raise HTTPException(status_code=404, detail="Medicine not found")
    
    slot = await db.time_slots.find_one({"slot_id": request.slot_id, "user_id": user_id}, {"_id": 0})
    if not slot:
        raise HTTPException(status_code=404, detail="Time slot not found")
    
    # Get pills per dose from schedule entry
    schedule_entry = await db.schedule_entries.find_one({
        "user_id": user_id, "medicine_id": request.medicine_id, "slot_id": request.slot_id
    }, {"_id": 0})
    
    pills_per_dose = 1.0
    if schedule_entry:
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
        {"$set": {"stock_count": new_stock}}
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

# ============== HEALTH CHECK ==============

@api_router.get("/")
async def root():
    return {"message": "MediTrack API", "version": "1.0.0"}

@api_router.get("/health")
async def health_check():
    return {"status": "healthy"}

# Include router and middleware
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
