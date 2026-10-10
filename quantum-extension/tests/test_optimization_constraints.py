import unittest
import numpy as np
import sys, os

sys.path.append(os.path.join(os.path.dirname(__file__), "..", "src"))
from optimization_model import create_default_scenario, ScanningOptimizationModel, BandProfile

class TestOptimizationConstraints(unittest.TestCase):
    def setUp(self):
        self.model = create_default_scenario()

    def test_dimensions(self):
        self.assertEqual(self.model.num_bands, 4)
        self.assertEqual(self.model.num_slots, 2)
        self.assertEqual(self.model.num_qubits, 8)

    def test_valid_allocation(self):
        # Allocate band 0 to slot 0 (index 0) and band 1 to slot 1 (index 3)
        # band 0 slot 0 -> b=0, t=0 -> 0*2 + 0 = 0
        # band 1 slot 1 -> b=1, t=1 -> 1*2 + 1 = 3
        x = np.zeros(8)
        x[0] = 1.0
        x[3] = 1.0
        eval_res = self.model.evaluate_solution(x)
        self.assertTrue(eval_res["is_feasible"])
        self.assertEqual(eval_res["total_scans"], 2)
        self.assertFalse(eval_res["slot_collision"])
        self.assertFalse(eval_res["band_overdwell"])

    def test_slot_collision_rejected(self):
        # Two bands assigned to same slot 0:
        # band 0 slot 0 (idx 0), band 1 slot 0 (idx 2)
        x = np.zeros(8)
        x[0] = 1.0
        x[2] = 1.0
        eval_res = self.model.evaluate_solution(x)
        self.assertFalse(eval_res["is_feasible"])
        self.assertTrue(eval_res["slot_collision"])

    def test_budget_violation_rejected(self):
        # Only 1 slot assigned when budget is 2
        x = np.zeros(8)
        x[0] = 1.0
        eval_res = self.model.evaluate_solution(x)
        self.assertFalse(eval_res["is_feasible"])
        self.assertFalse(eval_res["budget_satisfied"])

if __name__ == "__main__":
    unittest.main()
