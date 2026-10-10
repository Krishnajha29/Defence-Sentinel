import unittest
import numpy as np
import sys, os

sys.path.append(os.path.join(os.path.dirname(__file__), "..", "src"))
from optimization_model import create_default_scenario
from classical_baseline import ClassicalSolvers

class TestBaselineSolvers(unittest.TestCase):
    def setUp(self):
        self.model = create_default_scenario()
        self.classical = ClassicalSolvers(self.model)

    def test_exact_solver_finds_optimum(self):
        exact_res = self.classical.solve_exact()
        self.assertIsNotNone(exact_res["best_feasible_solution"])
        self.assertTrue(exact_res["best_feasible_solution"]["is_feasible"])
        self.assertGreater(exact_res["best_feasible_solution"]["pure_utility"], 0.0)

    def test_greedy_solver_is_feasible(self):
        greedy_res = self.classical.solve_greedy()
        self.assertTrue(greedy_res["is_feasible"])
        self.assertEqual(greedy_res["total_scans"], self.model.budget)

    def test_recency_ucb1_solver_is_feasible(self):
        ucb1_res = self.classical.simulate_recency_ucb1_batch()
        self.assertTrue(ucb1_res["is_feasible"])
        self.assertEqual(ucb1_res["total_scans"], self.model.budget)

if __name__ == "__main__":
    unittest.main()
