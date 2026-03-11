"""
MediTrack API Tests
Tests user registration, login (by user_id and by email), medicines CRUD, 
time slots, schedule entries, and medicine logging
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test data
TEST_EMAIL = f"test_{uuid.uuid4().hex[:8]}@test.dk"
TEST_PIN = "1234"
TEST_NAME = "Test Anna Nielsen"

class TestHealthEndpoints:
    """Test health and root endpoints"""
    
    def test_root_endpoint(self):
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "MediTrack" in data["message"]
        print(f"SUCCESS: Root endpoint - {data}")
    
    def test_health_endpoint(self):
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        print(f"SUCCESS: Health check - {data}")


class TestUserRegistrationAndLogin:
    """Test user registration and login flows"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test user data"""
        self.email = TEST_EMAIL
        self.pin = TEST_PIN
        self.name = TEST_NAME
    
    def test_01_register_user(self):
        """Register a new user"""
        payload = {
            "pin": self.pin,
            "name": self.name,
            "email": self.email
        }
        response = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        assert response.status_code == 200, f"Registration failed: {response.text}"
        
        data = response.json()
        assert "user_id" in data
        assert data["email"] == self.email
        assert data["name"] == self.name
        assert data["language"] == "da"  # Default language is Danish
        
        # Store user_id for later tests
        TestUserRegistrationAndLogin.user_id = data["user_id"]
        print(f"SUCCESS: Registered user {data['user_id']}")
    
    def test_02_register_duplicate_email_fails(self):
        """Cannot register with same email twice"""
        payload = {
            "pin": "5678",
            "name": "Another User",
            "email": self.email
        }
        response = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        assert response.status_code == 400
        print("SUCCESS: Duplicate email rejected")
    
    def test_03_login_by_user_id(self):
        """Login with user_id and PIN"""
        payload = {
            "user_id": TestUserRegistrationAndLogin.user_id,
            "pin": self.pin
        }
        response = requests.post(f"{BASE_URL}/api/auth/login", json=payload)
        assert response.status_code == 200, f"Login failed: {response.text}"
        
        data = response.json()
        assert data["success"] == True
        assert data["user_id"] == TestUserRegistrationAndLogin.user_id
        assert data["email"] == self.email
        print(f"SUCCESS: Login by user_id successful")
    
    def test_04_login_by_user_id_wrong_pin(self):
        """Login with wrong PIN fails"""
        payload = {
            "user_id": TestUserRegistrationAndLogin.user_id,
            "pin": "9999"
        }
        response = requests.post(f"{BASE_URL}/api/auth/login", json=payload)
        assert response.status_code == 401
        print("SUCCESS: Wrong PIN rejected")
    
    def test_05_login_by_email(self):
        """Login with email and PIN (new endpoint)"""
        payload = {
            "email": self.email,
            "pin": self.pin
        }
        response = requests.post(f"{BASE_URL}/api/auth/login-email", json=payload)
        assert response.status_code == 200, f"Email login failed: {response.text}"
        
        data = response.json()
        assert data["success"] == True
        assert data["email"] == self.email
        assert "user_id" in data
        print(f"SUCCESS: Login by email successful")
    
    def test_06_login_by_email_wrong_pin(self):
        """Login by email with wrong PIN fails"""
        payload = {
            "email": self.email,
            "pin": "0000"
        }
        response = requests.post(f"{BASE_URL}/api/auth/login-email", json=payload)
        assert response.status_code == 401
        print("SUCCESS: Wrong PIN rejected for email login")
    
    def test_07_login_by_email_not_found(self):
        """Login by email that doesn't exist fails"""
        payload = {
            "email": "nonexistent@test.dk",
            "pin": "1234"
        }
        response = requests.post(f"{BASE_URL}/api/auth/login-email", json=payload)
        assert response.status_code == 404
        print("SUCCESS: Non-existent email rejected")
    
    def test_08_get_user(self):
        """Get user by ID"""
        response = requests.get(f"{BASE_URL}/api/auth/user/{TestUserRegistrationAndLogin.user_id}")
        assert response.status_code == 200
        
        data = response.json()
        assert data["email"] == self.email
        assert data["name"] == self.name
        print(f"SUCCESS: Get user returned correct data")
    
    def test_09_update_language(self):
        """Update user language preference"""
        payload = {"language": "en"}
        response = requests.put(
            f"{BASE_URL}/api/auth/user/{TestUserRegistrationAndLogin.user_id}/language",
            json=payload
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data["success"] == True
        assert data["language"] == "en"
        print("SUCCESS: Language updated to English")


class TestTimeSlotsAndMedicines:
    """Test time slots and medicine CRUD"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup using existing test user"""
        if not hasattr(TestUserRegistrationAndLogin, 'user_id'):
            pytest.skip("User registration test must run first")
        self.user_id = TestUserRegistrationAndLogin.user_id
    
    def test_01_get_time_slots(self):
        """Get time slots (auto-created on registration)"""
        response = requests.get(f"{BASE_URL}/api/timeslots/{self.user_id}")
        assert response.status_code == 200
        
        data = response.json()
        assert len(data) == 4  # Default 4 time slots
        slot_names = [s["name"] for s in data]
        assert "Morgen" in slot_names
        assert "Middag" in slot_names
        assert "Aften" in slot_names
        assert "Nat" in slot_names
        
        # Store slot_id for later
        TestTimeSlotsAndMedicines.morning_slot_id = next(
            s["slot_id"] for s in data if s["name"] == "Morgen"
        )
        print(f"SUCCESS: Retrieved {len(data)} time slots")
    
    def test_02_create_medicine(self):
        """Create a medicine"""
        payload = {
            "name": "Ibuprofen",
            "dosage": "400mg",
            "stock_count": 100,
            "reminder_days_before": 7
        }
        response = requests.post(f"{BASE_URL}/api/medicines/{self.user_id}", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert data["name"] == "Ibuprofen"
        assert data["dosage"] == "400mg"
        assert data["stock_count"] == 100
        assert data["reminder_days_before"] == 7
        assert data["status"] == "green"  # Good stock
        
        TestTimeSlotsAndMedicines.medicine_id = data["medicine_id"]
        print(f"SUCCESS: Created medicine {data['medicine_id']}")
    
    def test_03_get_medicines(self):
        """Get all medicines for user"""
        response = requests.get(f"{BASE_URL}/api/medicines/{self.user_id}")
        assert response.status_code == 200
        
        data = response.json()
        assert len(data) >= 1
        
        med = next((m for m in data if m["medicine_id"] == TestTimeSlotsAndMedicines.medicine_id), None)
        assert med is not None
        assert med["name"] == "Ibuprofen"
        print(f"SUCCESS: Retrieved {len(data)} medicines")
    
    def test_04_update_medicine(self):
        """Update medicine stock"""
        payload = {"stock_count": 50}
        response = requests.put(
            f"{BASE_URL}/api/medicines/{self.user_id}/{TestTimeSlotsAndMedicines.medicine_id}",
            json=payload
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data["stock_count"] == 50
        print("SUCCESS: Updated medicine stock")


class TestScheduleEntries:
    """Test schedule entry CRUD with day_doses system"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup using existing test user and medicine"""
        if not hasattr(TestUserRegistrationAndLogin, 'user_id'):
            pytest.skip("User registration test must run first")
        if not hasattr(TestTimeSlotsAndMedicines, 'medicine_id'):
            pytest.skip("Medicine creation test must run first")
        if not hasattr(TestTimeSlotsAndMedicines, 'morning_slot_id'):
            pytest.skip("Time slots test must run first")
            
        self.user_id = TestUserRegistrationAndLogin.user_id
        self.medicine_id = TestTimeSlotsAndMedicines.medicine_id
        self.slot_id = TestTimeSlotsAndMedicines.morning_slot_id
    
    def test_01_create_schedule_entry(self):
        """Create schedule entry with day_doses (variable doses per day)"""
        payload = {
            "medicine_id": self.medicine_id,
            "slot_id": self.slot_id,
            "day_doses": {
                "mon": {"whole": 1, "half": 0},
                "tue": {"whole": 1, "half": 0},
                "wed": {"whole": 1, "half": 0},
                "thu": {"whole": 1, "half": 0},
                "fri": {"whole": 1, "half": 0},
                "sat": {"whole": 1, "half": 0},
                "sun": {"whole": 1, "half": 0}
            }
        }
        response = requests.post(f"{BASE_URL}/api/schedule/{self.user_id}", json=payload)
        assert response.status_code == 200, f"Schedule creation failed: {response.text}"
        
        data = response.json()
        assert data["medicine_id"] == self.medicine_id
        assert data["slot_id"] == self.slot_id
        assert data["slot_name"] == "Morgen"
        assert "day_doses" in data
        assert data["day_doses"]["mon"]["whole"] == 1
        
        TestScheduleEntries.entry_id = data["entry_id"]
        print(f"SUCCESS: Created schedule entry {data['entry_id']}")
    
    def test_02_get_schedule(self):
        """Get schedule for user"""
        response = requests.get(f"{BASE_URL}/api/schedule/{self.user_id}")
        assert response.status_code == 200
        
        data = response.json()
        assert len(data) >= 1
        
        entry = next((e for e in data if e["entry_id"] == TestScheduleEntries.entry_id), None)
        assert entry is not None
        assert "day_doses" in entry
        print(f"SUCCESS: Retrieved {len(data)} schedule entries")
    
    def test_03_update_schedule_entry(self):
        """Update schedule entry day_doses"""
        payload = {
            "day_doses": {
                "mon": {"whole": 2, "half": 0},  # Increased Monday dose
                "tue": {"whole": 1, "half": 1},  # 1.5 pills on Tuesday
                "wed": {"whole": 1, "half": 0},
                "thu": {"whole": 1, "half": 0},
                "fri": {"whole": 1, "half": 0}
                # Removed sat/sun
            }
        }
        response = requests.put(
            f"{BASE_URL}/api/schedule/{self.user_id}/{TestScheduleEntries.entry_id}",
            json=payload
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data["day_doses"]["mon"]["whole"] == 2
        assert data["day_doses"]["tue"]["half"] == 1
        assert "sat" not in data["day_doses"]
        print("SUCCESS: Updated schedule entry")
    
    def test_04_medicine_status_updates_with_schedule(self):
        """Medicine status should reflect consumption from schedule"""
        response = requests.get(f"{BASE_URL}/api/medicines/{self.user_id}")
        assert response.status_code == 200
        
        data = response.json()
        med = next((m for m in data if m["medicine_id"] == self.medicine_id), None)
        assert med is not None
        
        # With weekly consumption, status/days_until_empty should be calculated
        assert "days_until_empty" in med
        assert med["days_until_empty"] > 0
        print(f"SUCCESS: Medicine status shows {med['days_until_empty']} days until empty")


class TestMedicineLogging:
    """Test medicine taking/logging functionality"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup using existing test data"""
        if not hasattr(TestUserRegistrationAndLogin, 'user_id'):
            pytest.skip("User registration test must run first")
        if not hasattr(TestTimeSlotsAndMedicines, 'medicine_id'):
            pytest.skip("Medicine creation test must run first")
        if not hasattr(TestTimeSlotsAndMedicines, 'morning_slot_id'):
            pytest.skip("Time slots test must run first")
            
        self.user_id = TestUserRegistrationAndLogin.user_id
        self.medicine_id = TestTimeSlotsAndMedicines.medicine_id
        self.slot_id = TestTimeSlotsAndMedicines.morning_slot_id
    
    def test_01_take_medicine(self):
        """Log taking medicine"""
        from datetime import datetime
        today = datetime.now().strftime("%Y-%m-%d")
        
        payload = {
            "medicine_id": self.medicine_id,
            "slot_id": self.slot_id,
            "date": today
        }
        response = requests.post(f"{BASE_URL}/api/log/{self.user_id}", json=payload)
        assert response.status_code == 200, f"Take medicine failed: {response.text}"
        
        data = response.json()
        assert data["medicine_id"] == self.medicine_id
        assert data["slot_id"] == self.slot_id
        assert data["date"] == today
        
        TestMedicineLogging.log_id = data["log_id"]
        print(f"SUCCESS: Logged medicine taking {data['log_id']}")
    
    def test_02_get_medicine_logs(self):
        """Get medicine logs for user"""
        response = requests.get(f"{BASE_URL}/api/log/{self.user_id}")
        assert response.status_code == 200
        
        data = response.json()
        assert len(data) >= 1
        
        log = next((l for l in data if l["log_id"] == TestMedicineLogging.log_id), None)
        assert log is not None
        print(f"SUCCESS: Retrieved {len(data)} medicine logs")
    
    def test_03_cannot_log_same_dose_twice(self):
        """Cannot log same medicine/slot/date twice"""
        from datetime import datetime
        today = datetime.now().strftime("%Y-%m-%d")
        
        payload = {
            "medicine_id": self.medicine_id,
            "slot_id": self.slot_id,
            "date": today
        }
        response = requests.post(f"{BASE_URL}/api/log/{self.user_id}", json=payload)
        assert response.status_code == 400
        print("SUCCESS: Duplicate log rejected")
    
    def test_04_undo_take_medicine(self):
        """Undo (delete) medicine log"""
        response = requests.delete(f"{BASE_URL}/api/log/{self.user_id}/{TestMedicineLogging.log_id}")
        assert response.status_code == 200
        
        data = response.json()
        assert data["success"] == True
        print("SUCCESS: Medicine log undone")


class TestSpecialOrdination:
    """Test special ordination feature in schedule entries"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup using existing test data"""
        if not hasattr(TestUserRegistrationAndLogin, 'user_id'):
            pytest.skip("User registration test must run first")
        if not hasattr(TestTimeSlotsAndMedicines, 'medicine_id'):
            pytest.skip("Medicine creation test must run first")
        if not hasattr(TestTimeSlotsAndMedicines, 'morning_slot_id'):
            pytest.skip("Time slots test must run first")
            
        self.user_id = TestUserRegistrationAndLogin.user_id
        self.medicine_id = TestTimeSlotsAndMedicines.medicine_id
        self.slot_id = TestTimeSlotsAndMedicines.morning_slot_id
    
    def test_01_create_schedule_with_special_ordination(self):
        """Create schedule entry with special ordination (empty day_doses)"""
        payload = {
            "medicine_id": self.medicine_id,
            "slot_id": self.slot_id,
            "day_doses": {},  # Empty when using special ordination
            "special_ordination": {
                "start_date": "2026-03-15",
                "end_date": "2026-06-15",
                "repeat": "weekly"
            }
        }
        response = requests.post(f"{BASE_URL}/api/schedule/{self.user_id}", json=payload)
        assert response.status_code == 200, f"Schedule creation with ordination failed: {response.text}"
        
        data = response.json()
        assert data["medicine_id"] == self.medicine_id
        assert data["slot_id"] == self.slot_id
        assert data["special_ordination"] is not None
        assert data["special_ordination"]["start_date"] == "2026-03-15"
        assert data["special_ordination"]["end_date"] == "2026-06-15"
        assert data["special_ordination"]["repeat"] == "weekly"
        assert data["day_doses"] == {}  # Empty
        
        TestSpecialOrdination.ordination_entry_id = data["entry_id"]
        print(f"SUCCESS: Created schedule with special ordination {data['entry_id']}")
    
    def test_02_get_schedule_with_ordination(self):
        """Verify special ordination is returned in schedule GET"""
        response = requests.get(f"{BASE_URL}/api/schedule/{self.user_id}")
        assert response.status_code == 200
        
        data = response.json()
        entry = next((e for e in data if e.get("entry_id") == TestSpecialOrdination.ordination_entry_id), None)
        assert entry is not None
        assert entry["special_ordination"] is not None
        assert entry["special_ordination"]["repeat"] == "weekly"
        print("SUCCESS: Schedule GET returns special ordination data")
    
    def test_03_update_schedule_ordination(self):
        """Update special ordination on existing entry"""
        payload = {
            "special_ordination": {
                "start_date": "2026-04-01",
                "end_date": None,  # Open-ended
                "repeat": "daily"
            }
        }
        response = requests.put(
            f"{BASE_URL}/api/schedule/{self.user_id}/{TestSpecialOrdination.ordination_entry_id}",
            json=payload
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data["special_ordination"]["start_date"] == "2026-04-01"
        assert data["special_ordination"]["repeat"] == "daily"
        print("SUCCESS: Updated special ordination")
    
    def test_04_delete_ordination_entry(self):
        """Delete schedule entry with ordination"""
        response = requests.delete(
            f"{BASE_URL}/api/schedule/{self.user_id}/{TestSpecialOrdination.ordination_entry_id}"
        )
        assert response.status_code == 200
        print("SUCCESS: Deleted schedule entry with ordination")


class TestCleanup:
    """Cleanup test data"""
    
    def test_delete_schedule_entry(self):
        """Delete schedule entry"""
        if not hasattr(TestScheduleEntries, 'entry_id'):
            pytest.skip("No schedule entry to delete")
        
        user_id = TestUserRegistrationAndLogin.user_id
        entry_id = TestScheduleEntries.entry_id
        
        response = requests.delete(f"{BASE_URL}/api/schedule/{user_id}/{entry_id}")
        assert response.status_code == 200
        print("SUCCESS: Schedule entry deleted")
    
    def test_delete_medicine(self):
        """Delete medicine"""
        if not hasattr(TestTimeSlotsAndMedicines, 'medicine_id'):
            pytest.skip("No medicine to delete")
        
        user_id = TestUserRegistrationAndLogin.user_id
        medicine_id = TestTimeSlotsAndMedicines.medicine_id
        
        response = requests.delete(f"{BASE_URL}/api/medicines/{user_id}/{medicine_id}")
        assert response.status_code == 200
        print("SUCCESS: Medicine deleted")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
