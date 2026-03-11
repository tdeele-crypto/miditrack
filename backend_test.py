#!/usr/bin/env python3
"""
MediTrack Backend API Testing Suite
Tests the updated pill counting system where pills_per_dose moved from Medicine to Schedule
"""

import requests
import sys
import json
from datetime import datetime, timedelta
from typing import Dict, Any, Optional

class MediTrackAPITester:
    def __init__(self, base_url="https://vps-multi-hosting.preview.emergentagent.com"):
        self.base_url = base_url
        self.user_id = None
        self.test_medicine_id = None
        self.test_slot_id = None
        self.test_schedule_entry_id = None
        self.tests_run = 0
        self.tests_passed = 0
        self.session = requests.Session()
        self.session.headers.update({'Content-Type': 'application/json'})

    def log_test(self, name: str, success: bool, details: str = ""):
        """Log test results"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name}: PASSED {details}")
        else:
            print(f"❌ {name}: FAILED {details}")
        return success

    def make_request(self, method: str, endpoint: str, data: Dict[Any, Any] = None) -> tuple:
        """Make HTTP request and return (success, response, status_code)"""
        url = f"{self.base_url}/api/{endpoint}"
        try:
            if method.upper() == 'GET':
                response = self.session.get(url)
            elif method.upper() == 'POST':
                response = self.session.post(url, json=data)
            elif method.upper() == 'PUT':
                response = self.session.put(url, json=data)
            elif method.upper() == 'DELETE':
                response = self.session.delete(url)
            else:
                return False, {}, 400

            try:
                json_response = response.json()
            except:
                json_response = {"error": "Invalid JSON response"}
                
            return response.status_code < 400, json_response, response.status_code
        except Exception as e:
            return False, {"error": str(e)}, 0

    def setup_test_user(self) -> bool:
        """Create a test user for testing"""
        print("\n🔧 Setting up test user...")
        test_email = f"test_{datetime.now().strftime('%H%M%S')}@test.com"
        
        success, response, status = self.make_request('POST', 'auth/register', {
            "pin": "1234",
            "name": "Test User",
            "email": test_email
        })
        
        if success and 'user_id' in response:
            self.user_id = response['user_id']
            return self.log_test("User Registration", True, f"User ID: {self.user_id}")
        return self.log_test("User Registration", False, f"Status: {status}, Response: {response}")

    def test_medicine_creation_without_pills_per_dose(self) -> bool:
        """Test creating medicine without pills_per_dose field"""
        print("\n🧪 Testing medicine creation without pills_per_dose...")
        
        success, response, status = self.make_request('POST', f'medicines/{self.user_id}', {
            "name": "Test Medicine",
            "dosage": "500mg",
            "stock_count": 100,
            "reminder_days_before": 7
        })
        
        if success and 'medicine_id' in response:
            self.test_medicine_id = response['medicine_id']
            # Verify no pills_per_dose in response
            has_pills_per_dose = 'pills_per_dose' in response
            return self.log_test(
                "Medicine Creation (no pills_per_dose)", 
                not has_pills_per_dose, 
                f"Medicine ID: {self.test_medicine_id}, Has pills_per_dose: {has_pills_per_dose}"
            )
        return self.log_test("Medicine Creation", False, f"Status: {status}, Response: {response}")

    def test_get_time_slots(self) -> bool:
        """Get time slots for schedule testing"""
        print("\n🕒 Getting time slots...")
        
        success, response, status = self.make_request('GET', f'timeslots/{self.user_id}')
        
        if success and isinstance(response, list) and len(response) > 0:
            self.test_slot_id = response[0]['slot_id']
            return self.log_test("Get Time Slots", True, f"Found {len(response)} slots, using: {self.test_slot_id}")
        return self.log_test("Get Time Slots", False, f"Status: {status}, Response: {response}")

    def test_schedule_creation_with_pills_fields(self) -> bool:
        """Test creating schedule entry with pills_whole and pills_half fields"""
        print("\n📅 Testing schedule creation with pill fields...")
        
        success, response, status = self.make_request('POST', f'schedule/{self.user_id}', {
            "medicine_id": self.test_medicine_id,
            "slot_id": self.test_slot_id,
            "days": ["mon", "wed", "fri"],
            "pills_whole": 1,
            "pills_half": 1  # 1.5 pills total per dose
        })
        
        if success and 'entry_id' in response:
            self.test_schedule_entry_id = response['entry_id']
            # Verify pills_per_dose calculation
            pills_per_dose = response.get('pills_per_dose', 0)
            expected_pills = 1.5  # 1 whole + 1 half
            calculation_correct = abs(pills_per_dose - expected_pills) < 0.001
            
            return self.log_test(
                "Schedule Creation (with pill fields)", 
                calculation_correct, 
                f"Entry ID: {self.test_schedule_entry_id}, pills_per_dose: {pills_per_dose} (expected: {expected_pills})"
            )
        return self.log_test("Schedule Creation", False, f"Status: {status}, Response: {response}")

    def test_medicine_status_calculation(self) -> bool:
        """Test medicine status calculation based on schedule entries"""
        print("\n📊 Testing medicine status calculation...")
        
        success, response, status = self.make_request('GET', f'medicines/{self.user_id}')
        
        if success and isinstance(response, list) and len(response) > 0:
            medicine = next((m for m in response if m['medicine_id'] == self.test_medicine_id), None)
            if medicine:
                # With 1.5 pills per dose, 3 days per week: (1.5 * 3) / 7 = 0.643 pills per day
                # With 100 pills: 100 / 0.643 = ~155 days (should be green status)
                status_present = 'status' in medicine and 'days_until_empty' in medicine
                return self.log_test(
                    "Medicine Status Calculation", 
                    status_present, 
                    f"Status: {medicine.get('status')}, Days until empty: {medicine.get('days_until_empty')}"
                )
            return self.log_test("Medicine Status Calculation", False, "Medicine not found in response")
        return self.log_test("Medicine Status Calculation", False, f"Status: {status}, Response: {response}")

    def test_take_medicine_stock_reduction(self) -> bool:
        """Test taking medicine reduces stock by correct pills_per_dose from schedule"""
        print("\n💊 Testing take medicine stock reduction...")
        
        # First get current stock
        success, response, status = self.make_request('GET', f'medicines/{self.user_id}')
        if not success:
            return self.log_test("Take Medicine - Get Stock", False, f"Status: {status}")
            
        initial_stock = next((m['stock_count'] for m in response if m['medicine_id'] == self.test_medicine_id), 0)
        
        # Take medicine
        today = datetime.now().strftime('%Y-%m-%d')
        success, response, status = self.make_request('POST', f'log/{self.user_id}', {
            "medicine_id": self.test_medicine_id,
            "slot_id": self.test_slot_id,
            "date": today
        })
        
        if success and 'log_id' in response:
            log_id = response['log_id']
            
            # Check stock after taking medicine
            success, response, status = self.make_request('GET', f'medicines/{self.user_id}')
            if success:
                new_stock = next((m['stock_count'] for m in response if m['medicine_id'] == self.test_medicine_id), 0)
                expected_reduction = 1.5  # From schedule: 1 whole + 1 half
                actual_reduction = initial_stock - new_stock
                
                reduction_correct = abs(actual_reduction - expected_reduction) < 0.001
                return self.log_test(
                    "Take Medicine Stock Reduction", 
                    reduction_correct, 
                    f"Initial: {initial_stock}, New: {new_stock}, Reduction: {actual_reduction} (expected: {expected_reduction})"
                )
        return self.log_test("Take Medicine Stock Reduction", False, f"Status: {status}, Response: {response}")

    def test_undo_medicine_stock_restoration(self) -> bool:
        """Test undo restores correct amount from pills_taken"""
        print("\n↩️ Testing undo medicine stock restoration...")
        
        # Get current stock before undo
        success, response, status = self.make_request('GET', f'medicines/{self.user_id}')
        if not success:
            return self.log_test("Undo Medicine - Get Stock", False, f"Status: {status}")
            
        stock_before_undo = next((m['stock_count'] for m in response if m['medicine_id'] == self.test_medicine_id), 0)
        
        # Get the log entry
        today = datetime.now().strftime('%Y-%m-%d')
        success, response, status = self.make_request('GET', f'log/{self.user_id}?date={today}')
        
        if success and isinstance(response, list) and len(response) > 0:
            log_entry = response[0]  # Get first log entry
            log_id = log_entry['log_id']
            
            # Undo the medicine
            success, response, status = self.make_request('DELETE', f'log/{self.user_id}/{log_id}')
            
            if success:
                # Check stock after undo
                success, response, status = self.make_request('GET', f'medicines/{self.user_id}')
                if success:
                    stock_after_undo = next((m['stock_count'] for m in response if m['medicine_id'] == self.test_medicine_id), 0)
                    expected_restoration = 1.5  # Should restore 1.5 pills
                    actual_restoration = stock_after_undo - stock_before_undo
                    
                    restoration_correct = abs(actual_restoration - expected_restoration) < 0.001
                    return self.log_test(
                        "Undo Medicine Stock Restoration", 
                        restoration_correct, 
                        f"Before: {stock_before_undo}, After: {stock_after_undo}, Restoration: {actual_restoration} (expected: {expected_restoration})"
                    )
        return self.log_test("Undo Medicine Stock Restoration", False, f"Status: {status}, Response: {response}")

    def test_schedule_display_pill_info(self) -> bool:
        """Test schedule displays pill dose info correctly"""
        print("\n📋 Testing schedule display shows pill dose info...")
        
        success, response, status = self.make_request('GET', f'schedule/{self.user_id}')
        
        if success and isinstance(response, list) and len(response) > 0:
            schedule_entry = next((s for s in response if s['entry_id'] == self.test_schedule_entry_id), None)
            if schedule_entry:
                has_pills_whole = 'pills_whole' in schedule_entry
                has_pills_half = 'pills_half' in schedule_entry
                has_pills_per_dose = 'pills_per_dose' in schedule_entry
                
                pills_whole = schedule_entry.get('pills_whole', 0)
                pills_half = schedule_entry.get('pills_half', 0)
                pills_per_dose = schedule_entry.get('pills_per_dose', 0)
                
                all_fields_present = has_pills_whole and has_pills_half and has_pills_per_dose
                calculation_correct = abs((pills_whole + pills_half * 0.5) - pills_per_dose) < 0.001
                
                return self.log_test(
                    "Schedule Display Pill Info", 
                    all_fields_present and calculation_correct, 
                    f"Whole: {pills_whole}, Half: {pills_half}, Per dose: {pills_per_dose}, Fields present: {all_fields_present}, Calc correct: {calculation_correct}"
                )
            return self.log_test("Schedule Display Pill Info", False, "Schedule entry not found")
        return self.log_test("Schedule Display Pill Info", False, f"Status: {status}, Response: {response}")

    def test_health_endpoints(self) -> bool:
        """Test basic health endpoints"""
        print("\n🏥 Testing health endpoints...")
        
        # Test root endpoint
        success, response, status = self.make_request('GET', '')
        root_test = self.log_test("Health - Root", success and 'message' in response, f"Status: {status}")
        
        # Test health endpoint
        success, response, status = self.make_request('GET', 'health')
        health_test = self.log_test("Health - Check", success and response.get('status') == 'healthy', f"Status: {status}")
        
        return root_test and health_test

    def run_all_tests(self):
        """Run all tests in sequence"""
        print("🚀 Starting MediTrack Backend API Tests")
        print("=" * 50)
        
        # Setup
        if not self.setup_test_user():
            print("❌ Cannot continue without test user")
            return False
            
        # Core functionality tests
        tests = [
            self.test_health_endpoints,
            self.test_medicine_creation_without_pills_per_dose,
            self.test_get_time_slots,
            self.test_schedule_creation_with_pills_fields,
            self.test_medicine_status_calculation,
            self.test_take_medicine_stock_reduction,
            self.test_undo_medicine_stock_restoration,
            self.test_schedule_display_pill_info,
        ]
        
        for test in tests:
            try:
                test()
            except Exception as e:
                self.log_test(test.__name__, False, f"Exception: {str(e)}")
        
        # Summary
        print("\n" + "=" * 50)
        print(f"📊 Test Results: {self.tests_passed}/{self.tests_run} passed")
        success_rate = (self.tests_passed / self.tests_run * 100) if self.tests_run > 0 else 0
        print(f"✨ Success Rate: {success_rate:.1f}%")
        
        return self.tests_passed == self.tests_run

def main():
    """Main test execution"""
    tester = MediTrackAPITester()
    success = tester.run_all_tests()
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())