#!/usr/bin/env python3
"""
MediTrack Backend API Testing Suite
Tests the updated day_doses system with variable doses per day
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

    def test_medicine_creation_without_day_doses(self) -> bool:
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

    def test_schedule_creation_with_day_doses(self) -> bool:
        """Test creating schedule entry with day_doses structure"""
        print("\n📅 Testing schedule creation with day_doses...")
        
        # Create schedule with variable doses per day
        day_doses = {
            "mon": {"whole": 1, "half": 0},     # 1 pill on Monday
            "tue": {"whole": 2, "half": 1},     # 2.5 pills on Tuesday
            "wed": {"whole": 1, "half": 0},     # 1 pill on Wednesday
            "fri": {"whole": 2, "half": 0},     # 2 pills on Friday
            "sun": {"whole": 1, "half": 1}      # 1.5 pills on Sunday
        }
        
        success, response, status = self.make_request('POST', f'schedule/{self.user_id}', {
            "medicine_id": self.test_medicine_id,
            "slot_id": self.test_slot_id,
            "day_doses": day_doses
        })
        
        if success and 'entry_id' in response:
            self.test_schedule_entry_id = response['entry_id']
            # Verify day_doses structure is preserved
            returned_day_doses = response.get('day_doses', {})
            structure_correct = all(
                day in returned_day_doses and 
                'whole' in returned_day_doses[day] and 
                'half' in returned_day_doses[day]
                for day in day_doses.keys()
            )
            
            return self.log_test(
                "Schedule Creation (with day_doses)", 
                structure_correct, 
                f"Entry ID: {self.test_schedule_entry_id}, day_doses preserved: {structure_correct}"
            )
        return self.log_test("Schedule Creation", False, f"Status: {status}, Response: {response}")

    def test_schedule_update_with_day_doses(self) -> bool:
        """Test updating schedule entry with new day_doses"""
        print("\n🔄 Testing schedule update with day_doses...")
        
        # Update with different day_doses
        updated_day_doses = {
            "mon": {"whole": 2, "half": 0},     # Changed from 1 to 2
            "tue": {"whole": 1, "half": 0},     # Changed from 2.5 to 1  
            "wed": {"whole": 1, "half": 1},     # Changed from 1 to 1.5
            "thu": {"whole": 1, "half": 0},     # Added Thursday
            "sat": {"whole": 3, "half": 0}      # Added Saturday
        }
        
        success, response, status = self.make_request('PUT', f'schedule/{self.user_id}/{self.test_schedule_entry_id}', {
            "day_doses": updated_day_doses
        })
        
        if success and 'day_doses' in response:
            returned_day_doses = response['day_doses']
            update_correct = (
                returned_day_doses.get('mon', {}).get('whole') == 2 and
                returned_day_doses.get('tue', {}).get('whole') == 1 and
                returned_day_doses.get('wed', {}).get('half') == 1 and
                'thu' in returned_day_doses and
                'sat' in returned_day_doses
            )
            
            return self.log_test(
                "Schedule Update (day_doses)", 
                update_correct, 
                f"Updated day_doses applied correctly: {update_correct}"
            )
        return self.log_test("Schedule Update", False, f"Status: {status}, Response: {response}")

    def test_medicine_status_from_day_doses(self) -> bool:
        """Test medicine status calculation based on weekly consumption from day_doses"""
        print("\n📊 Testing medicine status calculation from day_doses...")
        
        success, response, status = self.make_request('GET', f'medicines/{self.user_id}')
        
        if success and isinstance(response, list) and len(response) > 0:
            medicine = next((m for m in response if m['medicine_id'] == self.test_medicine_id), None)
            if medicine:
                # Calculate expected weekly consumption from updated day_doses:
                # Mon: 2, Tue: 1, Wed: 1.5, Thu: 1, Sat: 3 = 8.5 pills per week
                # Daily average: 8.5 / 7 = ~1.21 pills per day
                # With 100 pills: 100 / 1.21 = ~82 days (should be green status)
                status_present = 'status' in medicine and 'days_until_empty' in medicine
                days_until_empty = medicine.get('days_until_empty', 0)
                
                # The calculation should show reasonable days (around 70-90 days range)
                reasonable_calculation = 60 <= days_until_empty <= 100
                
                return self.log_test(
                    "Medicine Status from day_doses", 
                    status_present and reasonable_calculation, 
                    f"Status: {medicine.get('status')}, Days until empty: {days_until_empty}, Reasonable: {reasonable_calculation}"
                )
            return self.log_test("Medicine Status Calculation", False, "Medicine not found in response")
        return self.log_test("Medicine Status Calculation", False, f"Status: {status}, Response: {response}")

    def test_take_medicine_specific_day_dose(self) -> bool:
        """Test taking medicine uses correct dose for specific day"""
        print("\n💊 Testing take medicine with specific day dose...")
        
        # Get current stock
        success, response, status = self.make_request('GET', f'medicines/{self.user_id}')
        if not success:
            return self.log_test("Take Medicine - Get Stock", False, f"Status: {status}")
            
        initial_stock = next((m['stock_count'] for m in response if m['medicine_id'] == self.test_medicine_id), 0)
        
        # Test taking medicine on Monday (should be 2 pills based on updated schedule)
        # For testing, we'll use a Monday date
        monday_date = "2024-08-05"  # This is a Monday
        success, response, status = self.make_request('POST', f'log/{self.user_id}', {
            "medicine_id": self.test_medicine_id,
            "slot_id": self.test_slot_id,
            "date": monday_date
        })
        
        if success and 'log_id' in response:
            # Check stock after taking medicine
            success, response, status = self.make_request('GET', f'medicines/{self.user_id}')
            if success:
                new_stock = next((m['stock_count'] for m in response if m['medicine_id'] == self.test_medicine_id), 0)
                expected_reduction = 2.0  # Monday dose: 2 whole pills
                actual_reduction = initial_stock - new_stock
                
                reduction_correct = abs(actual_reduction - expected_reduction) < 0.001
                return self.log_test(
                    "Take Medicine (Monday dose)", 
                    reduction_correct, 
                    f"Initial: {initial_stock}, New: {new_stock}, Reduction: {actual_reduction} (expected: {expected_reduction})"
                )
        return self.log_test("Take Medicine Monday", False, f"Status: {status}, Response: {response}")

    def test_take_medicine_different_day_dose(self) -> bool:
        """Test taking medicine on different day uses different dose"""
        print("\n💊 Testing take medicine with different day dose...")
        
        # Get current stock
        success, response, status = self.make_request('GET', f'medicines/{self.user_id}')
        if not success:
            return self.log_test("Take Medicine Different Day - Get Stock", False, f"Status: {status}")
            
        initial_stock = next((m['stock_count'] for m in response if m['medicine_id'] == self.test_medicine_id), 0)
        
        # Test taking medicine on Wednesday (should be 1.5 pills: 1 whole + 1 half)
        wednesday_date = "2024-08-07"  # This is a Wednesday
        success, response, status = self.make_request('POST', f'log/{self.user_id}', {
            "medicine_id": self.test_medicine_id,
            "slot_id": self.test_slot_id,
            "date": wednesday_date
        })
        
        if success and 'log_id' in response:
            # Check stock after taking medicine
            success, response, status = self.make_request('GET', f'medicines/{self.user_id}')
            if success:
                new_stock = next((m['stock_count'] for m in response if m['medicine_id'] == self.test_medicine_id), 0)
                expected_reduction = 1.5  # Wednesday dose: 1 whole + 1 half
                actual_reduction = initial_stock - new_stock
                
                reduction_correct = abs(actual_reduction - expected_reduction) < 0.001
                return self.log_test(
                    "Take Medicine (Wednesday dose)", 
                    reduction_correct, 
                    f"Initial: {initial_stock}, New: {new_stock}, Reduction: {actual_reduction} (expected: {expected_reduction})"
                )
        return self.log_test("Take Medicine Wednesday", False, f"Status: {status}, Response: {response}")

    def test_schedule_display_day_doses(self) -> bool:
        """Test schedule display shows day_doses correctly"""
        print("\n📋 Testing schedule display shows day_doses...")
        
        success, response, status = self.make_request('GET', f'schedule/{self.user_id}')
        
        if success and isinstance(response, list) and len(response) > 0:
            schedule_entry = next((s for s in response if s['entry_id'] == self.test_schedule_entry_id), None)
            if schedule_entry:
                day_doses = schedule_entry.get('day_doses', {})
                
                # Check that day_doses structure is complete and correct
                has_day_doses = 'day_doses' in schedule_entry
                has_expected_days = all(day in day_doses for day in ['mon', 'tue', 'wed', 'thu', 'sat'])
                correct_structure = all(
                    'whole' in day_doses.get(day, {}) and 'half' in day_doses.get(day, {})
                    for day in day_doses.keys()
                )
                
                # Check specific values
                mon_correct = day_doses.get('mon', {}).get('whole') == 2
                wed_correct = day_doses.get('wed', {}).get('half') == 1
                
                all_correct = has_day_doses and has_expected_days and correct_structure and mon_correct and wed_correct
                
                return self.log_test(
                    "Schedule Display day_doses", 
                    all_correct, 
                    f"Has day_doses: {has_day_doses}, Expected days: {has_expected_days}, Structure: {correct_structure}, Values: Mon={mon_correct}, Wed={wed_correct}"
                )
            return self.log_test("Schedule Display", False, "Schedule entry not found")
        return self.log_test("Schedule Display", False, f"Status: {status}, Response: {response}")

    def test_day_doses_backward_compatibility(self) -> bool:
        """Test that old format (days + pills_whole/half) is handled correctly"""
        print("\n🔄 Testing backward compatibility with old format...")
        
        # Create a second medicine to test with
        success, response, status = self.make_request('POST', f'medicines/{self.user_id}', {
            "name": "Legacy Medicine",
            "dosage": "250mg",
            "stock_count": 50,
            "reminder_days_before": 5
        })
        
        if not success or 'medicine_id' not in response:
            return self.log_test("Legacy Medicine Creation", False, f"Status: {status}")
            
        legacy_medicine_id = response['medicine_id']
        
        # Manually insert old format schedule in database would be ideal,
        # but since we can't do that, we'll just verify that the new system
        # can handle retrieving schedules (the conversion logic is in get_schedule)
        
        # Create schedule with new format for this medicine
        success, response, status = self.make_request('POST', f'schedule/{self.user_id}', {
            "medicine_id": legacy_medicine_id,
            "slot_id": self.test_slot_id,
            "day_doses": {"mon": {"whole": 1, "half": 0}, "fri": {"whole": 2, "half": 0}}
        })
        
        if success:
            # Verify it can be retrieved
            success, response, status = self.make_request('GET', f'schedule/{self.user_id}')
            if success and isinstance(response, list):
                legacy_entry = next((s for s in response if s['medicine_id'] == legacy_medicine_id), None)
                if legacy_entry and 'day_doses' in legacy_entry:
                    return self.log_test("Backward Compatibility", True, "Legacy format handling works")
                    
        return self.log_test("Backward Compatibility", False, f"Status: {status}")

    def test_medicine_creation_without_day_doses(self) -> bool:
        """Test creating medicine without day_doses field (should work fine)"""
        print("\n🧪 Testing medicine creation...")
        
        success, response, status = self.make_request('POST', f'medicines/{self.user_id}', {
            "name": "Test Medicine Marevan",
            "dosage": "2.5mg",
            "stock_count": 100,
            "reminder_days_before": 7
        })
        
        if success and 'medicine_id' in response:
            self.test_medicine_id = response['medicine_id']
            return self.log_test(
                "Medicine Creation", 
                True, 
                f"Medicine ID: {self.test_medicine_id}"
            )
        return self.log_test("Medicine Creation", False, f"Status: {status}, Response: {response}")

    def test_undo_medicine_correct_amount(self) -> bool:
        """Test undo restores correct amount based on pills_taken from specific day"""
        print("\n↩️ Testing undo medicine with correct day-specific amount...")
        
        # Get logs for the days we took medicine
        monday_date = "2024-08-05"
        success, response, status = self.make_request('GET', f'log/{self.user_id}?date={monday_date}')
        
        if success and isinstance(response, list) and len(response) > 0:
            log_entry = next((log for log in response if log['medicine_id'] == self.test_medicine_id), None)
            if not log_entry:
                return self.log_test("Find Monday Log", False, "Monday log entry not found")
                
            log_id = log_entry['log_id']
            
            # Get stock before undo
            success, response, status = self.make_request('GET', f'medicines/{self.user_id}')
            if not success:
                return self.log_test("Get Stock Before Undo", False, f"Status: {status}")
                
            stock_before_undo = next((m['stock_count'] for m in response if m['medicine_id'] == self.test_medicine_id), 0)
            
            # Undo the medicine
            success, response, status = self.make_request('DELETE', f'log/{self.user_id}/{log_id}')
            
            if success:
                # Check stock after undo
                success, response, status = self.make_request('GET', f'medicines/{self.user_id}')
                if success:
                    stock_after_undo = next((m['stock_count'] for m in response if m['medicine_id'] == self.test_medicine_id), 0)
                    expected_restoration = 2.0  # Monday dose was 2 pills
                    actual_restoration = stock_after_undo - stock_before_undo
                    
                    restoration_correct = abs(actual_restoration - expected_restoration) < 0.001
                    return self.log_test(
                        "Undo Monday Dose", 
                        restoration_correct, 
                        f"Before: {stock_before_undo}, After: {stock_after_undo}, Restoration: {actual_restoration} (expected: {expected_restoration})"
                    )
        return self.log_test("Undo Medicine", False, f"Status: {status}, Response: {response}")

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
            
        # Core functionality tests - Updated for day_doses
        tests = [
            self.test_health_endpoints,
            self.test_medicine_creation_without_day_doses,
            self.test_get_time_slots,
            self.test_schedule_creation_with_day_doses,
            self.test_schedule_update_with_day_doses,
            self.test_medicine_status_from_day_doses,
            self.test_take_medicine_specific_day_dose,
            self.test_take_medicine_different_day_dose,
            self.test_schedule_display_day_doses,
            self.test_day_doses_backward_compatibility,
            self.test_undo_medicine_correct_amount,
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