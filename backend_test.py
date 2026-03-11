#!/usr/bin/env python3
import requests
import sys
from datetime import datetime
import json
import uuid

class MediTrackAPITester:
    def __init__(self, base_url="https://vps-multi-hosting.preview.emergentagent.com"):
        self.base_url = base_url
        self.user_id = None
        self.user_email = None
        self.medicine_id = None
        self.slot_id = None
        self.schedule_entry_id = None
        self.log_id = None
        self.tests_run = 0
        self.tests_passed = 0
        self.session = requests.Session()
        self.session.timeout = 30

    def run_test(self, name, method, endpoint, expected_status, data=None, params=None):
        """Run a single API test"""
        url = f"{self.base_url}/api/{endpoint}"
        headers = {'Content-Type': 'application/json'}

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {method} {url}")
        
        try:
            if method == 'GET':
                response = self.session.get(url, headers=headers, params=params)
            elif method == 'POST':
                response = self.session.post(url, json=data, headers=headers)
            elif method == 'PUT':
                response = self.session.put(url, json=data, headers=headers)
            elif method == 'DELETE':
                response = self.session.delete(url, headers=headers)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"   ✅ Passed - Status: {response.status_code}")
                try:
                    return success, response.json()
                except:
                    return success, {}
            else:
                print(f"   ❌ Failed - Expected {expected_status}, got {response.status_code}")
                print(f"   Response: {response.text[:200]}...")
                return False, {}

        except Exception as e:
            print(f"   ❌ Failed - Error: {str(e)}")
            return False, {}

    def test_health_check(self):
        """Test API health check"""
        success, response = self.run_test("Health Check", "GET", "", 200)
        return success

    def test_root_endpoint(self):
        """Test root API endpoint"""
        success, response = self.run_test("Root Endpoint", "GET", "", 200)
        if success and 'message' in response:
            print(f"   API Message: {response.get('message')}")
        return success

    def test_user_registration(self):
        """Test user registration with PIN"""
        timestamp = datetime.now().strftime('%H%M%S')
        test_email = f"test_user_{timestamp}@example.com"
        self.user_email = test_email
        
        test_data = {
            "pin": "1234",
            "name": f"Test User {timestamp}",
            "email": test_email
        }
        
        success, response = self.run_test(
            "User Registration",
            "POST", 
            "auth/register",
            200,
            data=test_data
        )
        
        if success and 'user_id' in response:
            self.user_id = response['user_id']
            print(f"   User ID: {self.user_id}")
            print(f"   User Name: {response.get('name')}")
            print(f"   Language: {response.get('language', 'N/A')}")
        return success

    def test_user_login(self):
        """Test user login with PIN"""
        if not self.user_id:
            print("   ❌ Skipped - No user_id available")
            return False
            
        login_data = {
            "user_id": self.user_id,
            "pin": "1234"
        }
        
        success, response = self.run_test(
            "User Login",
            "POST",
            "auth/login", 
            200,
            data=login_data
        )
        
        if success:
            print(f"   Login Success: {response.get('success')}")
            print(f"   User Name: {response.get('name')}")
        return success

    def test_get_user_profile(self):
        """Test getting user profile"""
        if not self.user_id:
            print("   ❌ Skipped - No user_id available")
            return False
            
        success, response = self.run_test(
            "Get User Profile",
            "GET",
            f"auth/user/{self.user_id}",
            200
        )
        return success

    def test_pin_reset_request(self):
        """Test PIN reset request"""
        if not self.user_email:
            print("   ❌ Skipped - No email available")
            return False
            
        reset_data = {"email": self.user_email}
        
        success, response = self.run_test(
            "PIN Reset Request",
            "POST",
            "auth/request-pin-reset",
            200,
            data=reset_data
        )
        
        if success:
            print(f"   Reset code (testing): {response.get('code_for_testing')}")
        return success

    def test_language_update(self):
        """Test language update"""
        if not self.user_id:
            print("   ❌ Skipped - No user_id available")
            return False
            
        lang_data = {"language": "en"}
        
        success, response = self.run_test(
            "Update Language",
            "PUT",
            f"auth/user/{self.user_id}/language",
            200,
            data=lang_data
        )
        return success

    def test_add_medicine(self):
        """Test adding a new medicine"""
        if not self.user_id:
            print("   ❌ Skipped - No user_id available")
            return False
            
        medicine_data = {
            "name": "Test Painkiller",
            "dosage": "500mg",
            "stock_count": 30,
            "pills_per_dose": 1,
            "reminder_days_before": 7
        }
        
        success, response = self.run_test(
            "Add Medicine",
            "POST",
            f"medicines/{self.user_id}",
            200,
            data=medicine_data
        )
        
        if success and 'medicine_id' in response:
            self.medicine_id = response['medicine_id']
            print(f"   Medicine ID: {self.medicine_id}")
            print(f"   Status: {response.get('status')}")
            print(f"   Days until empty: {response.get('days_until_empty')}")
        return success

    def test_get_medicines(self):
        """Test getting user's medicines"""
        if not self.user_id:
            print("   ❌ Skipped - No user_id available")
            return False
            
        success, response = self.run_test(
            "Get Medicines",
            "GET",
            f"medicines/{self.user_id}",
            200
        )
        
        if success and isinstance(response, list):
            print(f"   Found {len(response)} medicines")
            for med in response:
                print(f"   - {med.get('name')}: {med.get('status')} status")
        return success

    def test_update_medicine(self):
        """Test updating medicine"""
        if not self.user_id or not self.medicine_id:
            print("   ❌ Skipped - No user_id or medicine_id available")
            return False
            
        update_data = {
            "stock_count": 15,
            "reminder_days_before": 5
        }
        
        success, response = self.run_test(
            "Update Medicine",
            "PUT",
            f"medicines/{self.user_id}/{self.medicine_id}",
            200,
            data=update_data
        )
        
        if success:
            print(f"   New stock: {response.get('stock_count')}")
            print(f"   New status: {response.get('status')}")
        return success

    def test_get_time_slots(self):
        """Test getting default time slots"""
        if not self.user_id:
            print("   ❌ Skipped - No user_id available")
            return False
            
        success, response = self.run_test(
            "Get Time Slots",
            "GET",
            f"timeslots/{self.user_id}",
            200
        )
        
        if success and isinstance(response, list):
            print(f"   Found {len(response)} time slots")
            for slot in response:
                print(f"   - {slot.get('name')}: {slot.get('time')}")
                if not self.slot_id:  # Store first slot for schedule tests
                    self.slot_id = slot.get('slot_id')
        return success

    def test_add_schedule_entry(self):
        """Test adding medicine to schedule"""
        if not self.user_id or not self.medicine_id or not self.slot_id:
            print("   ❌ Skipped - Missing required IDs")
            return False
            
        schedule_data = {
            "medicine_id": self.medicine_id,
            "slot_id": self.slot_id,
            "days": ["mon", "tue", "wed", "thu", "fri"]
        }
        
        success, response = self.run_test(
            "Add Schedule Entry",
            "POST",
            f"schedule/{self.user_id}",
            200,
            data=schedule_data
        )
        
        if success and 'entry_id' in response:
            self.schedule_entry_id = response['entry_id']
            print(f"   Schedule entry ID: {self.schedule_entry_id}")
            print(f"   Medicine: {response.get('medicine_name')}")
            print(f"   Time slot: {response.get('slot_name')} at {response.get('slot_time')}")
        return success

    def test_get_schedule(self):
        """Test getting user's schedule"""
        if not self.user_id:
            print("   ❌ Skipped - No user_id available")
            return False
            
        success, response = self.run_test(
            "Get Schedule",
            "GET",
            f"schedule/{self.user_id}",
            200
        )
        
        if success and isinstance(response, list):
            print(f"   Found {len(response)} schedule entries")
        return success

    def test_take_medicine(self):
        """Test taking medicine (logging)"""
        if not self.user_id or not self.medicine_id or not self.slot_id:
            print("   ❌ Skipped - Missing required IDs")
            return False
            
        today = datetime.now().strftime('%Y-%m-%d')
        log_data = {
            "medicine_id": self.medicine_id,
            "slot_id": self.slot_id,
            "date": today
        }
        
        success, response = self.run_test(
            "Take Medicine",
            "POST",
            f"log/{self.user_id}",
            200,
            data=log_data
        )
        
        if success and 'log_id' in response:
            self.log_id = response['log_id']
            print(f"   Log ID: {self.log_id}")
            print(f"   Taken at: {response.get('taken_at')}")
        return success

    def test_get_medicine_logs(self):
        """Test getting medicine logs"""
        if not self.user_id:
            print("   ❌ Skipped - No user_id available")
            return False
            
        today = datetime.now().strftime('%Y-%m-%d')
        
        success, response = self.run_test(
            "Get Medicine Logs",
            "GET",
            f"log/{self.user_id}",
            200,
            params={"date": today}
        )
        
        if success and isinstance(response, list):
            print(f"   Found {len(response)} log entries for today")
        return success

    def test_undo_take_medicine(self):
        """Test undoing medicine take"""
        if not self.user_id or not self.log_id:
            print("   ❌ Skipped - Missing user_id or log_id")
            return False
            
        success, response = self.run_test(
            "Undo Take Medicine",
            "DELETE",
            f"log/{self.user_id}/{self.log_id}",
            200
        )
        return success

    def test_delete_schedule_entry(self):
        """Test deleting schedule entry"""
        if not self.user_id or not self.schedule_entry_id:
            print("   ❌ Skipped - Missing user_id or schedule_entry_id")
            return False
            
        success, response = self.run_test(
            "Delete Schedule Entry",
            "DELETE",
            f"schedule/{self.user_id}/{self.schedule_entry_id}",
            200
        )
        return success

    def test_delete_medicine(self):
        """Test deleting medicine"""
        if not self.user_id or not self.medicine_id:
            print("   ❌ Skipped - Missing user_id or medicine_id")
            return False
            
        success, response = self.run_test(
            "Delete Medicine",
            "DELETE",
            f"medicines/{self.user_id}/{self.medicine_id}",
            200
        )
        return success

    def run_all_tests(self):
        """Run complete test suite"""
        print("=" * 60)
        print("🚀 MEDITRACK API TESTING SUITE")
        print("=" * 60)
        
        # Health checks
        self.test_health_check()
        self.test_root_endpoint()
        
        # Authentication flow
        self.test_user_registration()
        self.test_user_login()
        self.test_get_user_profile()
        self.test_pin_reset_request()
        self.test_language_update()
        
        # Medicine management
        self.test_add_medicine()
        self.test_get_medicines()
        self.test_update_medicine()
        
        # Time slots
        self.test_get_time_slots()
        
        # Schedule management
        self.test_add_schedule_entry()
        self.test_get_schedule()
        
        # Medicine logging
        self.test_take_medicine()
        self.test_get_medicine_logs()
        self.test_undo_take_medicine()
        
        # Cleanup
        self.test_delete_schedule_entry()
        self.test_delete_medicine()
        
        # Results
        print("\n" + "=" * 60)
        print(f"📊 TEST RESULTS: {self.tests_passed}/{self.tests_run} PASSED")
        success_rate = (self.tests_passed / self.tests_run) * 100 if self.tests_run > 0 else 0
        print(f"📈 SUCCESS RATE: {success_rate:.1f}%")
        print("=" * 60)
        
        return self.tests_passed == self.tests_run

def main():
    """Run the test suite"""
    tester = MediTrackAPITester()
    
    try:
        success = tester.run_all_tests()
        return 0 if success else 1
    except KeyboardInterrupt:
        print("\n\n⚠️  Tests interrupted by user")
        return 1
    except Exception as e:
        print(f"\n\n❌ Test suite failed with error: {str(e)}")
        return 1

if __name__ == "__main__":
    sys.exit(main())