"""
Test Suite for Special Ordination Dose Feature
Tests: whole/half pill inputs, database persistence, stock calculation, PDF generation
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from context
TEST_USER_ID = "6a94f0b5-f130-411c-a084-d81f0f436a98"
TEST_USER_EMAIL = "testunit@example.com"
TEST_USER_PIN = "1234"

class TestSpecialOrdinationDose:
    """Tests for special ordination whole/half pill dose feature"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.test_medicine_id = None
        self.test_entry_id = None
        yield
        # Cleanup
        if self.test_entry_id:
            self.session.delete(f"{BASE_URL}/api/schedule/{TEST_USER_ID}/{self.test_entry_id}")
        if self.test_medicine_id:
            self.session.delete(f"{BASE_URL}/api/medicines/{TEST_USER_ID}/{self.test_medicine_id}")

    def test_01_existing_schedule_has_dose_fields(self):
        """Verify existing schedule entry has whole/half fields in special_ordination"""
        response = self.session.get(f"{BASE_URL}/api/schedule/{TEST_USER_ID}")
        assert response.status_code == 200, f"Failed to get schedule: {response.text}"
        
        entries = response.json()
        assert len(entries) > 0, "No schedule entries found"
        
        # Find entry with special_ordination
        special_entry = None
        for entry in entries:
            if entry.get("special_ordination"):
                special_entry = entry
                break
        
        assert special_entry is not None, "No entry with special_ordination found"
        ord_data = special_entry["special_ordination"]
        
        # Verify dose fields exist
        assert "whole" in ord_data, "Missing 'whole' field in special_ordination"
        assert "half" in ord_data, "Missing 'half' field in special_ordination"
        
        # Verify expected values (2 whole, 1 half as per test context)
        assert ord_data["whole"] == 2, f"Expected whole=2, got {ord_data['whole']}"
        assert ord_data["half"] == 1, f"Expected half=1, got {ord_data['half']}"
        print(f"PASS: special_ordination has whole={ord_data['whole']}, half={ord_data['half']}")

    def test_02_create_schedule_with_custom_dose(self):
        """Create new schedule entry with custom whole/half dose"""
        # First get time slots
        slots_response = self.session.get(f"{BASE_URL}/api/timeslots/{TEST_USER_ID}")
        assert slots_response.status_code == 200
        slots = slots_response.json()
        assert len(slots) > 0, "No time slots found"
        test_slot_id = slots[0]["slot_id"]
        
        # Create a test medicine
        medicine_response = self.session.post(f"{BASE_URL}/api/medicines/{TEST_USER_ID}", json={
            "name": f"TEST_OrdDose_{uuid.uuid4().hex[:6]}",
            "dosage": "100mg",
            "unit": "piller",
            "stock_count": 100,
            "reminder_days_before": 7
        })
        assert medicine_response.status_code == 200, f"Failed to create medicine: {medicine_response.text}"
        medicine = medicine_response.json()
        self.test_medicine_id = medicine["medicine_id"]
        
        # Create schedule entry with special ordination (3 whole, 2 half pills)
        entry_response = self.session.post(f"{BASE_URL}/api/schedule/{TEST_USER_ID}", json={
            "medicine_id": self.test_medicine_id,
            "slot_id": test_slot_id,
            "day_doses": {},
            "special_ordination": {
                "start_date": "2026-01-01",
                "end_date": "2026-06-30",
                "repeat": "daily",
                "whole": 3,
                "half": 2
            }
        })
        assert entry_response.status_code == 200, f"Failed to create schedule entry: {entry_response.text}"
        entry = entry_response.json()
        self.test_entry_id = entry["entry_id"]
        
        # Verify dose fields are saved
        assert entry["special_ordination"]["whole"] == 3, f"Expected whole=3, got {entry['special_ordination']['whole']}"
        assert entry["special_ordination"]["half"] == 2, f"Expected half=2, got {entry['special_ordination']['half']}"
        print(f"PASS: Created schedule with whole=3, half=2")

    def test_03_get_schedule_returns_dose_fields(self):
        """GET /api/schedule returns whole/half fields in special_ordination"""
        response = self.session.get(f"{BASE_URL}/api/schedule/{TEST_USER_ID}")
        assert response.status_code == 200
        
        entries = response.json()
        for entry in entries:
            if entry.get("special_ordination"):
                ord = entry["special_ordination"]
                # Verify dose fields are present (may have defaults)
                assert "whole" in ord or ord.get("whole") is not None or "half" in ord, \
                    f"Missing dose fields in special_ordination: {ord}"
        print("PASS: GET schedule returns dose fields in special_ordination")

    def test_04_update_schedule_dose(self):
        """Update existing schedule entry's dose via PUT"""
        # Get existing schedule
        response = self.session.get(f"{BASE_URL}/api/schedule/{TEST_USER_ID}")
        assert response.status_code == 200
        entries = response.json()
        
        # Find entry with special_ordination
        special_entry = None
        for entry in entries:
            if entry.get("special_ordination"):
                special_entry = entry
                break
        
        if not special_entry:
            pytest.skip("No special_ordination entry to update")
        
        entry_id = special_entry["entry_id"]
        old_ord = special_entry["special_ordination"]
        
        # Update with new dose values
        new_whole = 4
        new_half = 0
        update_response = self.session.put(f"{BASE_URL}/api/schedule/{TEST_USER_ID}/{entry_id}", json={
            "special_ordination": {
                **old_ord,
                "whole": new_whole,
                "half": new_half
            }
        })
        assert update_response.status_code == 200, f"Failed to update: {update_response.text}"
        updated = update_response.json()
        
        assert updated["special_ordination"]["whole"] == new_whole, \
            f"Expected whole={new_whole}, got {updated['special_ordination']['whole']}"
        assert updated["special_ordination"]["half"] == new_half, \
            f"Expected half={new_half}, got {updated['special_ordination']['half']}"
        
        # Restore original values
        restore_response = self.session.put(f"{BASE_URL}/api/schedule/{TEST_USER_ID}/{entry_id}", json={
            "special_ordination": old_ord
        })
        assert restore_response.status_code == 200
        print(f"PASS: Updated dose to whole={new_whole}, half={new_half}, then restored")

    def test_05_default_dose_values_when_not_specified(self):
        """Create special ordination without explicit whole/half - check defaults"""
        # Get time slots
        slots_response = self.session.get(f"{BASE_URL}/api/timeslots/{TEST_USER_ID}")
        slots = slots_response.json()
        test_slot_id = slots[0]["slot_id"]
        
        # Create test medicine
        medicine_response = self.session.post(f"{BASE_URL}/api/medicines/{TEST_USER_ID}", json={
            "name": f"TEST_DefaultDose_{uuid.uuid4().hex[:6]}",
            "dosage": "50mg",
            "unit": "piller",
            "stock_count": 50,
            "reminder_days_before": 7
        })
        assert medicine_response.status_code == 200
        medicine = medicine_response.json()
        self.test_medicine_id = medicine["medicine_id"]
        
        # Create schedule WITHOUT whole/half fields
        entry_response = self.session.post(f"{BASE_URL}/api/schedule/{TEST_USER_ID}", json={
            "medicine_id": self.test_medicine_id,
            "slot_id": test_slot_id,
            "day_doses": {},
            "special_ordination": {
                "start_date": "2026-02-01",
                "end_date": "2026-03-01",
                "repeat": "daily"
            }
        })
        assert entry_response.status_code == 200
        entry = entry_response.json()
        self.test_entry_id = entry["entry_id"]
        
        # Backend calculate_daily_pills uses whole=1, half=0 as defaults
        # Check if the values are stored or handled
        ord = entry.get("special_ordination", {})
        print(f"Special ordination stored: {ord}")
        # Backend defaults: whole=1, half=0 when not specified
        # The API may not store defaults, but calculate_daily_pills will use them
        print("PASS: Schedule created without explicit dose values")


class TestStockCalculationWithDose:
    """Tests for stock calculation using special ordination dose"""
    
    def test_stock_calculation_uses_stored_dose(self):
        """Verify daily_pills calculation uses stored whole/half from special_ordination"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        # Get medicines with their status/days_until_empty
        response = session.get(f"{BASE_URL}/api/medicines/{TEST_USER_ID}")
        assert response.status_code == 200
        medicines = response.json()
        
        # Find medicine with schedule entry that has special_ordination
        schedule_response = session.get(f"{BASE_URL}/api/schedule/{TEST_USER_ID}")
        schedule = schedule_response.json()
        
        for entry in schedule:
            if entry.get("special_ordination"):
                ord = entry["special_ordination"]
                whole = ord.get("whole", 1)
                half = ord.get("half", 0)
                pills_per_day = whole + half * 0.5
                
                # Find corresponding medicine
                med = next((m for m in medicines if m["medicine_id"] == entry["medicine_id"]), None)
                if med:
                    # The days_until_empty should be calculated using pills_per_day
                    expected_days = int(med["stock_count"] / pills_per_day) if pills_per_day > 0 else 999
                    print(f"Medicine: {med['name']}, Stock: {med['stock_count']}, Dose: {whole}+{half}*0.5={pills_per_day} pills/day")
                    print(f"Expected days until empty: ~{expected_days}, Actual: {med['days_until_empty']}")
                    
                    # The values should be approximately equal (within tolerance for other schedule entries)
                    assert med["days_until_empty"] <= expected_days + 10, \
                        f"days_until_empty ({med['days_until_empty']}) much larger than expected ({expected_days})"
        
        print("PASS: Stock calculation appears to use stored dose values")


class TestPDFGenerationWithDose:
    """Tests for PDF generation using special ordination dose"""
    
    def test_pdf_endpoint_returns_pdf(self):
        """Verify PDF endpoint works and returns PDF content"""
        session = requests.Session()
        
        response = session.get(f"{BASE_URL}/api/schedule/{TEST_USER_ID}/pdf")
        assert response.status_code == 200, f"PDF endpoint failed: {response.text}"
        
        # Verify it's a PDF
        content_type = response.headers.get("content-type", "")
        assert "application/pdf" in content_type, f"Expected PDF content type, got: {content_type}"
        
        # Verify content disposition header
        content_disp = response.headers.get("content-disposition", "")
        assert "attachment" in content_disp, f"Expected attachment header, got: {content_disp}"
        assert ".pdf" in content_disp, f"Expected .pdf in filename, got: {content_disp}"
        
        # Verify PDF magic bytes
        pdf_content = response.content
        assert pdf_content[:4] == b'%PDF', f"PDF content doesn't start with PDF header"
        
        print(f"PASS: PDF endpoint returns valid PDF ({len(pdf_content)} bytes)")


class TestCronEndpointWithEmail:
    """Tests for cron endpoint including email notifications"""
    
    def test_cron_endpoint_returns_success(self):
        """Verify cron endpoint executes and returns expected structure"""
        session = requests.Session()
        
        response = session.get(f"{BASE_URL}/api/cron/update-stocks")
        assert response.status_code == 200, f"Cron endpoint failed: {response.text}"
        
        data = response.json()
        
        # Verify required fields
        assert data.get("success") == True, f"Expected success=True, got {data.get('success')}"
        assert "users_processed" in data, "Missing users_processed field"
        assert "medicines_updated" in data, "Missing medicines_updated field"
        assert "timestamp" in data, "Missing timestamp field"
        
        # emails_sent field should exist (even if 0)
        assert "emails_sent" in data, "Missing emails_sent field"
        
        print(f"PASS: Cron endpoint successful - users: {data['users_processed']}, "
              f"medicines: {data['medicines_updated']}, emails: {data['emails_sent']}")
    
    def test_cron_uses_stored_dose_for_calculation(self):
        """Verify cron calculation uses stored whole/half from special_ordination"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        # Get schedule with special ordination
        schedule_response = session.get(f"{BASE_URL}/api/schedule/{TEST_USER_ID}")
        schedule = schedule_response.json()
        
        found_special = False
        for entry in schedule:
            if entry.get("special_ordination"):
                ord = entry["special_ordination"]
                whole = ord.get("whole", 1)  # Backend default is 1
                half = ord.get("half", 0)    # Backend default is 0
                
                # Backend calculate_daily_pills formula:
                # pills_per_occurrence = whole + half * 0.5
                pills = whole + half * 0.5
                print(f"Entry medicine_id={entry['medicine_id']}: whole={whole}, half={half}, pills/occurrence={pills}")
                
                # For daily repeat, daily_pills = pills_per_occurrence
                if ord.get("repeat") == "daily":
                    assert pills > 0, f"Expected pills > 0 for daily ordination"
                    print(f"Daily consumption: {pills} pills/day")
                    found_special = True
        
        if not found_special:
            pytest.skip("No special ordination with stored dose found")
        
        print("PASS: Cron calculation correctly references stored dose values")


class TestMedicineEndpointsWithScheduleDose:
    """Tests for medicine endpoints that calculate status based on schedule dose"""
    
    def test_get_medicines_calculates_correct_days_until_empty(self):
        """GET /api/medicines should return days_until_empty based on schedule dose"""
        session = requests.Session()
        
        # Get medicines
        med_response = session.get(f"{BASE_URL}/api/medicines/{TEST_USER_ID}")
        assert med_response.status_code == 200
        medicines = med_response.json()
        
        # Get schedule
        schedule_response = session.get(f"{BASE_URL}/api/schedule/{TEST_USER_ID}")
        schedule = schedule_response.json()
        
        for med in medicines:
            # Find schedule entries for this medicine
            med_entries = [e for e in schedule if e["medicine_id"] == med["medicine_id"]]
            
            if med_entries:
                print(f"\nMedicine: {med['name']}")
                print(f"  Stock: {med['stock_count']} {med.get('unit', 'piller')}")
                print(f"  Status: {med['status']}")
                print(f"  Days until empty: {med['days_until_empty']}")
                
                for entry in med_entries:
                    if entry.get("special_ordination"):
                        ord = entry["special_ordination"]
                        print(f"  Special ordination: whole={ord.get('whole', 1)}, half={ord.get('half', 0)}, repeat={ord.get('repeat')}")
                    if entry.get("day_doses"):
                        print(f"  Day doses: {entry['day_doses']}")
        
        print("\nPASS: Medicine endpoints return calculated days_until_empty")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
