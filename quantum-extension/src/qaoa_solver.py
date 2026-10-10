"""
QAOA Solver for Q-Sentinel:
Converts QUBO to Ising Hamiltonian and executes Quantum Approximate Optimization Algorithm (QAOA)
using Qiskit and Qiskit Primitives (StatevectorSampler).
"""

import numpy as np
from typing import Dict, Tuple, List
from scipy.optimize import minimize

from qiskit import QuantumCircuit
from qiskit.circuit import ParameterVector
from qiskit.primitives import StatevectorSampler

from optimization_model import ScanningOptimizationModel

class QAOASolver:
    def __init__(self, model: ScanningOptimizationModel, p_layers: int = 2):
        self.model = model
        self.p = p_layers
        self.num_qubits = model.num_qubits
        self.sampler = StatevectorSampler()
        self.ising_h, self.ising_J, self.ising_offset = self._qubo_to_ising()

    def _qubo_to_ising(self) -> Tuple[np.ndarray, np.ndarray, float]:
        """
        Maps QUBO: Minimize x^T Q x + offset_q
        to Ising Hamiltonian: H = sum_i h_i Z_i + sum_{i < j} J_{ij} Z_i Z_j + offset_ising
        Using mapping: x_i = (I - Z_i) / 2
        """
        N = self.num_qubits
        Q, _, offset_q = self.model.build_qubo()

        h = np.zeros(N, dtype=float)
        J = np.zeros((N, N), dtype=float)
        offset_ising = offset_q

        for i in range(N):
            # Q[i, i] * x_i = Q[i, i] * (1 - Z_i)/2 = Q[i, i]/2 - (Q[i, i]/2) * Z_i
            offset_ising += Q[i, i] / 2.0
            h[i] -= Q[i, i] / 2.0

            for j in range(i + 1, N):
                q_ij = Q[i, j]
                # Q[i, j] * x_i * x_j = Q[i, j] * (1 - Z_i)/2 * (1 - Z_j)/2
                # = Q[i, j]/4 * (1 - Z_i - Z_j + Z_i Z_j)
                offset_ising += q_ij / 4.0
                h[i] -= q_ij / 4.0
                h[j] -= q_ij / 4.0
                J[i, j] += q_ij / 4.0

        return h, J, offset_ising

    def create_qaoa_circuit(self, gammas: List[float], betas: List[float]) -> QuantumCircuit:
        """
        Constructs the parameterized QAOA quantum circuit of depth p.
        Initial state: |+>^N
        Layers:
          Cost unitary: exp(-i * gamma_k * H_C)
          Mixer unitary: exp(-i * beta_k * H_M), H_M = sum_i X_i
        """
        qc = QuantumCircuit(self.num_qubits)

        # 1. Initialization in equal superposition |+>^N
        qc.h(range(self.num_qubits))

        # 2. p Alternating layers
        for layer in range(self.p):
            gamma = gammas[layer]
            beta = betas[layer]

            # Cost Hamiltonian layer:
            # Single-qubit Z rotations for h_i Z_i: Rz(2 * gamma * h_i)
            for i in range(self.num_qubits):
                if abs(self.ising_h[i]) > 1e-6:
                    qc.rz(2.0 * gamma * self.ising_h[i], i)

            # Two-qubit ZZ interactions for J_{ij} Z_i Z_j: CNOT, Rz(2 * gamma * J_{ij}), CNOT
            for i in range(self.num_qubits):
                for j in range(i + 1, self.num_qubits):
                    if abs(self.ising_J[i, j]) > 1e-6:
                        qc.cx(i, j)
                        qc.rz(2.0 * gamma * self.ising_J[i, j], j)
                        qc.cx(i, j)

            # Mixer Hamiltonian layer:
            # Rx(2 * beta) for each qubit
            for i in range(self.num_qubits):
                qc.rx(2.0 * beta, i)

        qc.measure_all()
        return qc

    def compute_energy_for_counts(self, counts: Dict[str, int]) -> float:
        """
        Computes the expectation value of the QUBO energy from measurement counts.
        """
        total_shots = sum(counts.values())
        avg_energy = 0.0

        for bitstr_qiskit, count in counts.items():
            # Qiskit bitstring order is qubit N-1 ... qubit 0 (little endian)
            # Reversing to match indexing 0 ... N-1
            x = np.array([int(b) for b in reversed(bitstr_qiskit)], dtype=float)
            eval_res = self.model.evaluate_solution(x)
            avg_energy += (eval_res["qubo_energy"] * count) / total_shots

        return avg_energy

    def objective_function(self, params: np.ndarray, shots: int = 1000) -> float:
        """
        Evaluates energy for optimizer.
        params = [gamma_0, ..., gamma_{p-1}, beta_0, ..., beta_{p-1}]
        """
        gammas = params[:self.p]
        betas = params[self.p:]

        qc = self.create_qaoa_circuit(gammas, betas)
        job = self.sampler.run([qc], shots=shots)
        counts = job.result()[0].data.meas.get_counts()

        return self.compute_energy_for_counts(counts)

    def solve(self, maxiter: int = 40, shots: int = 2000, seed: int = 42) -> Dict:
        """
        Runs the classical-quantum hybrid optimization loop (COBYLA optimizer).
        """
        np.random.seed(seed)
        # Initial parameters
        init_gammas = np.random.uniform(0, np.pi, self.p)
        init_betas = np.random.uniform(0, np.pi / 2, self.p)
        init_params = np.concatenate([init_gammas, init_betas])

        optimization_history = []

        def callback_fn(xk):
            energy = self.objective_function(xk, shots=shots)
            optimization_history.append(float(energy))

        # Run classical optimizer
        res = minimize(
            self.objective_function,
            init_params,
            args=(shots,),
            method="COBYLA",
            options={"maxiter": maxiter, "disp": False},
            callback=callback_fn
        )

        opt_gammas = res.x[:self.p]
        opt_betas = res.x[self.p:]

        # Run final circuit with optimal parameters and larger shots for distribution
        final_qc = self.create_qaoa_circuit(opt_gammas, opt_betas)
        job = self.sampler.run([final_qc], shots=shots * 2)
        counts = job.result()[0].data.meas.get_counts()

        # Analyze sampled solutions
        total_shots = sum(counts.values())
        decoded_solutions = []
        feasible_count = 0
        best_solution = None
        best_feasible = None

        for bitstr_qiskit, count in counts.items():
            bitstr_natural = "".join(reversed(bitstr_qiskit))
            x = np.array([int(b) for b in bitstr_natural], dtype=float)
            eval_res = self.model.evaluate_solution(x)
            prob = count / total_shots

            sol_data = {
                "bitstring": bitstr_natural,
                "probability": round(prob, 4),
                "count": count,
                "qubo_energy": eval_res["qubo_energy"],
                "pure_utility": eval_res["pure_utility"],
                "is_feasible": eval_res["is_feasible"],
                "allocated_bands": eval_res["allocated_bands"],
                "allocation_grid": eval_res["allocation_grid"]
            }
            decoded_solutions.append(sol_data)

            if eval_res["is_feasible"]:
                feasible_count += count
                if best_feasible is None or eval_res["pure_utility"] > best_feasible["pure_utility"]:
                    best_feasible = sol_data

            if best_solution is None or eval_res["qubo_energy"] < best_solution["qubo_energy"]:
                best_solution = sol_data

        decoded_solutions.sort(key=lambda s: s["count"], reverse=True)

        return {
            "method": f"QAOA (p={self.p}) via Qiskit StatevectorSampler",
            "optimal_parameters": {
                "gammas": [round(float(g), 4) for g in opt_gammas],
                "betas": [round(float(b), 4) for b in opt_betas]
            },
            "iterations_run": len(optimization_history) or maxiter,
            "total_shots": total_shots,
            "feasible_rate": round(feasible_count / total_shots, 4),
            "best_solution": best_solution,
            "best_feasible_solution": best_feasible,
            "top_bitstrings": decoded_solutions[:5],
            "quantum_circuit": final_qc
        }
