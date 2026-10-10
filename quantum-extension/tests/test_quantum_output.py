import unittest
import numpy as np
import sys, os

sys.path.append(os.path.join(os.path.dirname(__file__), "..", "src"))
from optimization_model import create_default_scenario
from qaoa_solver import QAOASolver

class TestQuantumOutput(unittest.TestCase):
    def setUp(self):
        self.model = create_default_scenario()
        self.qaoa = QAOASolver(self.model, p_layers=1)

    def test_circuit_qubit_count(self):
        qc = self.qaoa.create_qaoa_circuit([0.5], [0.3])
        self.assertEqual(qc.num_qubits, self.model.num_qubits)

    def test_qaoa_runs_and_samples_distribution(self):
        # Quick run with small iteration and shots
        res = self.qaoa.solve(maxiter=5, shots=500, seed=42)
        self.assertIn("feasible_rate", res)
        self.assertGreaterEqual(res["feasible_rate"], 0.0)
        self.assertIsNotNone(res["best_solution"])

if __name__ == "__main__":
    unittest.main()
