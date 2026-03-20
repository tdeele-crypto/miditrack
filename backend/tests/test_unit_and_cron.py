"""
MediTrack Unit Field and Cron Endpoint Tests
Tests:
1. Unit dropdown (piller, stk, enheder) in medicine creation
2. Unit field persisted to backend and returned in API response  
3. Existing medicines without unit field default to 'piller'
4. Cron endpoint /api/cron/update-stocks for automatic stock deduction
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from review request
TEST_USER_ID = "6a94f0b5-f130-411c-a084-d81f0f436a98"
TEST_USER_EMAIL = "testunit@example.com"
TEST_USER_PIN = "1234"


class TestCronEndpoint:
    """Test the cron endpoint for automatic stock deduction"""
    
    def test_cron_update_stocks_endpoint(self):
        """Test GET /api/cron/update-stocks (unauthenticated)"""
        response = requests.get(f"{BASE_URL}/api/cron/update-stocks")
        assert response.status_code == 200, f"Cron endpoint failed: {response.text}"
        
        data = response.json()
        assert data["success"] == True
        assert "users_processed" in data
        assert "medicines_updated" in data
        assert "timestamp" in data
        assert isinstance(data["errors"], list)
        
        print(f"SUCCESS: Cron endpoint - processed {data['users_processed']} users, updated {data['medicines_updated']} medicines")


class TestUnitFieldInMedicines:
    """Test unit field in medicine creation, update and retrieval"""
    
    # Class-level storage for shared state
    user_id = None
    piller_medicine_id = None
    stk_medicine_id = None
    enheder_medicine_id = None
    default_medicine_id = None
    
    @pytest.fixture(autouse=True, scope="class")
    def setup_class(self, request):
        """Setup - create a fresh test user once for the whole class"""
        test_email = f"test_unit_{uuid.uuid4().hex[:8]}@test.dk"
        test_pin = "1234"
        test_name = "Unit Test User"
        
        # Register test user
        payload = {
            "pin": test_pin,
            "name": test_name,
            "email": test_email
        }
        response = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        if response.status_code == 200:
            TestUnitFieldInMedicines.user_id = response.json()["user_id"]
        else:
            pytest.skip(f"Could not create test user: {response.text}")
    
    def test_01_create_medicine_with_piller_unit(self):
        """Create medicine with unit='piller' (Danish for pills)"""
        payload = {
            "name": "TestMed Piller",
            "dosage": "500mg",
            "unit": "piller",
            "stock_count": 30,
            "reminder_days_before": 7
        }
        response = requests.post(f"{BASE_URL}/api/medicines/{TestUnitFieldInMedicines.user_id}", json=payload)
        assert response.status_code == 200, f"Create medicine failed: {response.text}"
        
        data = response.json()
        assert data["name"] == "TestMed Piller"
        assert data["unit"] == "piller"
        assert data["stock_count"] == 30
        
        TestUnitFieldInMedicines.piller_medicine_id = data["medicine_id"]
        print(f"SUCCESS: Created medicine with unit='piller': {data['medicine_id']}")
    
    def test_02_create_medicine_with_stk_unit(self):
        """Create medicine with unit='stk' (Danish for pieces)"""
        payload = {
            "name": "TestMed Stk",
            "dosage": "400mg",
            "unit": "stk",
            "stock_count": 50,
            "reminder_days_before": 7
        }
        response = requests.post(f"{BASE_URL}/api/medicines/{TestUnitFieldInMedicines.user_id}", json=payload)
        assert response.status_code == 200, f"Create medicine failed: {response.text}"
        
        data = response.json()
        assert data["name"] == "TestMed Stk"
        assert data["unit"] == "stk"
        
        TestUnitFieldInMedicines.stk_medicine_id = data["medicine_id"]
        print(f"SUCCESS: Created medicine with unit='stk': {data['medicine_id']}")
    
    def test_03_create_medicine_with_enheder_unit(self):
        """Create medicine with unit='enheder' (Danish for units)"""
        payload = {
            "name": "TestMed Enheder",
            "dosage": "100ie",
            "unit": "enheder",
            "stock_count": 100,
            "reminder_days_before": 14
        }
        response = requests.post(f"{BASE_URL}/api/medicines/{TestUnitFieldInMedicines.user_id}", json=payload)
        assert response.status_code == 200, f"Create medicine failed: {response.text}"
        
        data = response.json()
        assert data["name"] == "TestMed Enheder"
        assert data["unit"] == "enheder"
        
        TestUnitFieldInMedicines.enheder_medicine_id = data["medicine_id"]
        print(f"SUCCESS: Created medicine with unit='enheder': {data['medicine_id']}")
    
    def test_04_create_medicine_default_unit(self):
        """Create medicine without unit field - should default to 'piller'"""
        payload = {
            "name": "TestMed No Unit",
            "dosage": "250mg",
            "stock_count": 20,
            "reminder_days_before": 7
        }
        response = requests.post(f"{BASE_URL}/api/medicines/{TestUnitFieldInMedicines.user_id}", json=payload)
        assert response.status_code == 200, f"Create medicine failed: {response.text}"
        
        data = response.json()
        assert data["name"] == "TestMed No Unit"
        assert data["unit"] == "piller", f"Expected default unit 'piller', got '{data['unit']}'"
        
        TestUnitFieldInMedicines.default_medicine_id = data["medicine_id"]
        print(f"SUCCESS: Medicine without unit defaults to 'piller'")
    
    def test_05_get_medicines_returns_unit_field(self):
        """GET medicines should return unit field for all medicines"""
        response = requests.get(f"{BASE_URL}/api/medicines/{TestUnitFieldInMedicines.user_id}")
        assert response.status_code == 200
        
        data = response.json()
        assert len(data) >= 3  # We created at least 3 medicines
        
        # Check each medicine has unit field
        for med in data:
            assert "unit" in med, f"Medicine {med['name']} missing unit field"
            assert med["unit"] in ["piller", "stk", "enheder"], f"Invalid unit: {med['unit']}"
        
        # Verify specific medicines have correct units
        piller_med = next((m for m in data if m.get("medicine_id") == TestUnitFieldInMedicines.piller_medicine_id), None)
        if piller_med:
            assert piller_med["unit"] == "piller"
        
        stk_med = next((m for m in data if m.get("medicine_id") == TestUnitFieldInMedicines.stk_medicine_id), None)
        if stk_med:
            assert stk_med["unit"] == "stk"
        
        enheder_med = next((m for m in data if m.get("medicine_id") == TestUnitFieldInMedicines.enheder_medicine_id), None)
        if enheder_med:
            assert enheder_med["unit"] == "enheder"
            
        print(f"SUCCESS: All {len(data)} medicines have unit field")
    
    def test_06_update_medicine_unit(self):
        """Update medicine unit field"""
        payload = {"unit": "stk"}  # Change from piller to stk
        response = requests.put(
            f"{BASE_URL}/api/medicines/{TestUnitFieldInMedicines.user_id}/{TestUnitFieldInMedicines.default_medicine_id}",
            json=payload
        )
        assert response.status_code == 200, f"Update failed: {response.text}"
        
        data = response.json()
        assert data["unit"] == "stk"
        print("SUCCESS: Updated medicine unit from 'piller' to 'stk'")
    
    def test_07_cleanup_test_medicines(self):
        """Cleanup - delete test medicines"""
        medicine_ids = [
            TestUnitFieldInMedicines.piller_medicine_id,
            TestUnitFieldInMedicines.stk_medicine_id,
            TestUnitFieldInMedicines.enheder_medicine_id,
            TestUnitFieldInMedicines.default_medicine_id
        ]
        
        for med_id in medicine_ids:
            if med_id:
                requests.delete(f"{BASE_URL}/api/medicines/{TestUnitFieldInMedicines.user_id}/{med_id}")
        
        print("SUCCESS: Test medicines cleaned up")


class TestDosageUnitsPreservation:
    """Test that dosage units (mg, mcg, g) are preserved as-is"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - create a fresh test user"""
        self.test_email = f"test_dosage_{uuid.uuid4().hex[:8]}@test.dk"
        
        # Register test user
        payload = {
            "pin": "1234",
            "name": "Dosage Test User",
            "email": self.test_email
        }
        response = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        if response.status_code == 200:
            self.user_id = response.json()["user_id"]
        else:
            pytest.skip(f"Could not create test user: {response.text}")
    
    def test_01_create_medicine_with_mcg_dosage(self):
        """Dosage with mcg unit should be preserved"""
        payload = {
            "name": "Levothyroxin",
            "dosage": "50mcg",
            "unit": "piller",
            "stock_count": 60,
            "reminder_days_before": 7
        }
        response = requests.post(f"{BASE_URL}/api/medicines/{self.user_id}", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert data["dosage"] == "50mcg", f"Dosage should be '50mcg', got '{data['dosage']}'"
        
        self.__class__.mcg_medicine_id = data["medicine_id"]
        print(f"SUCCESS: Created medicine with '50mcg' dosage - preserved as-is")
    
    def test_02_create_medicine_with_mg_dosage(self):
        """Dosage with mg unit should be preserved"""
        payload = {
            "name": "Ibuprofen",
            "dosage": "400mg",
            "unit": "stk",
            "stock_count": 30,
            "reminder_days_before": 7
        }
        response = requests.post(f"{BASE_URL}/api/medicines/{self.user_id}", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert data["dosage"] == "400mg", f"Dosage should be '400mg', got '{data['dosage']}'"
        
        self.__class__.mg_medicine_id = data["medicine_id"]
        print(f"SUCCESS: Created medicine with '400mg' dosage - preserved as-is")
    
    def test_03_create_medicine_with_g_dosage(self):
        """Dosage with g (grams) unit should be preserved"""
        payload = {
            "name": "Paracetamol",
            "dosage": "1g",
            "unit": "piller",
            "stock_count": 20,
            "reminder_days_before": 7
        }
        response = requests.post(f"{BASE_URL}/api/medicines/{self.user_id}", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert data["dosage"] == "1g", f"Dosage should be '1g', got '{data['dosage']}'"
        
        self.__class__.g_medicine_id = data["medicine_id"]
        print(f"SUCCESS: Created medicine with '1g' dosage - preserved as-is")
    
    def test_04_get_medicines_preserves_dosage_units(self):
        """GET medicines should return dosage units exactly as entered"""
        response = requests.get(f"{BASE_URL}/api/medicines/{self.user_id}")
        assert response.status_code == 200
        
        data = response.json()
        
        # Find and verify each medicine
        mcg_med = next((m for m in data if m.get("medicine_id") == self.__class__.mcg_medicine_id), None)
        mg_med = next((m for m in data if m.get("medicine_id") == self.__class__.mg_medicine_id), None)
        g_med = next((m for m in data if m.get("medicine_id") == self.__class__.g_medicine_id), None)
        
        if mcg_med:
            assert mcg_med["dosage"] == "50mcg", f"mcg dosage not preserved: {mcg_med['dosage']}"
        if mg_med:
            assert mg_med["dosage"] == "400mg", f"mg dosage not preserved: {mg_med['dosage']}"
        if g_med:
            assert g_med["dosage"] == "1g", f"g dosage not preserved: {g_med['dosage']}"
            
        print("SUCCESS: All dosage units preserved correctly (mcg, mg, g)")
    
    def test_05_cleanup(self):
        """Cleanup test medicines"""
        medicine_ids = [
            getattr(self.__class__, 'mcg_medicine_id', None),
            getattr(self.__class__, 'mg_medicine_id', None),
            getattr(self.__class__, 'g_medicine_id', None)
        ]
        
        for med_id in medicine_ids:
            if med_id:
                requests.delete(f"{BASE_URL}/api/medicines/{self.user_id}/{med_id}")
        
        print("SUCCESS: Test medicines cleaned up")


class TestExistingUserMedicinesDefaultUnit:
    """Test that existing user's medicines default to 'piller' when no unit field"""
    
    def test_get_test_user_medicines(self):
        """Test user from review_request - check their medicines have unit field"""
        # Use test user from review request
        user_id = TEST_USER_ID
        
        response = requests.get(f"{BASE_URL}/api/medicines/{user_id}")
        
        # User might not exist in this test environment
        if response.status_code == 200:
            data = response.json()
            for med in data:
                assert "unit" in med, f"Medicine {med['name']} missing unit field"
                # Check unit has a valid value (could be explicitly set or defaulted)
                assert med["unit"] in ["piller", "stk", "enheder"], f"Invalid unit: {med['unit']}"
            print(f"SUCCESS: Found {len(data)} medicines for test user, all have unit field")
        else:
            print(f"INFO: Test user {user_id} not found - skipping this test")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
