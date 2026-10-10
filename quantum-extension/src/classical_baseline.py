"""
Classical Baselines for Scanning-Slot Allocation:
1. Exact Classical Brute-Force (Ground Truth Optimal)
2. Greedy Priority Allocation
3. Recency-Augmented UCB1 (Adaptive Online Benchmark from Defence Sentinel)
"""

import numpy as np
import itertools
from typing import Dict, List
from optimization_model import ScanningOptimizationModel, BandProfile

class ClassicalSolvers:
    def __init__(self, model: ScanningOptimizationModel):
        self.model = model

    def solve_exact(self) -> Dict:
        """
        Enumerates all 2^N possible bitstrings to find the exact global minimum of QUBO,
        as well as the exact best feasible solution for pure utility.
        """
        N = self.model.num_qubits
        best_qubo_energy = float("inf")
        best_qubo_solution = None

        best_utility = -float("inf")
        best_feasible_solution = None

        total_feasible = 0

        for candidate in itertools.product([0, 1], repeat=N):
            x = np.array(candidate, dtype=float)
            eval_res = self.model.evaluate_solution(x)

            if eval_res["qubo_energy"] < best_qubo_energy:
                best_qubo_energy = eval_res["qubo_energy"]
                best_qubo_solution = eval_res

            if eval_res["is_feasible"]:
                total_feasible += 1
                if eval_res["pure_utility"] > best_utility:
                    best_utility = eval_res["pure_utility"]
                    best_feasible_solution = eval_res

        return {
            "method": "Exact Classical Brute-Force",
            "search_space_size": 2 ** N,
            "total_feasible_count": total_feasible,
            "best_qubo_solution": best_qubo_solution,
            "best_feasible_solution": best_feasible_solution
        }

    def solve_greedy(self) -> Dict:
        """
        Greedy heuristic: Rank candidate bands by utility score,
        allocate the top K bands into available time slots.
        """
        band_utilities = [(b, self.model.get_band_utility(band)) for b, band in enumerate(self.model.bands)]
        band_utilities.sort(key=lambda item: item[1], reverse=True)

        x = np.zeros(self.model.num_qubits, dtype=float)
        slots_filled = 0
        for b, util in band_utilities:
            if slots_filled < self.model.num_slots and slots_filled < self.model.budget:
                slot = slots_filled
                idx = self.model.get_var_index(b, slot)
                x[idx] = 1.0
                slots_filled += 1

        eval_res = self.model.evaluate_solution(x)
        eval_res["method"] = "Classical Greedy Allocator"
        return eval_res

    def simulate_recency_ucb1_batch(self, exploration_c: float = 1.414, recency_lambda: float = 0.85) -> Dict:
        """
        Emulates Defence Sentinel's Recency-Augmented UCB1 online policy:
        Chooses bands based on UCB score combined with recency weighting over history.
        Allocates top selections for the current decision cycle.
        """
        scores = []
        for b, band in enumerate(self.model.bands):
            # UCB score = expected reward + exploration term + recency boost
            # In Defence Sentinel, score = empirical_hit_rate + c * sqrt(ln(N)/n_i) + recency_factor * urgency
            empirical_reward = band.activity_prob * band.priority
            recency_boost = recency_lambda * band.urgency
            score = empirical_reward + recency_boost - (self.model.w_c * band.scan_cost)
            scores.append((b, score))

        scores.sort(key=lambda item: item[1], reverse=True)

        x = np.zeros(self.model.num_qubits, dtype=float)
        slots_filled = 0
        for b, s in scores:
            if slots_filled < self.model.num_slots and slots_filled < self.model.budget:
                idx = self.model.get_var_index(b, slots_filled)
                x[idx] = 1.0
                slots_filled += 1

        eval_res = self.model.evaluate_solution(x)
        eval_res["method"] = "Recency-Augmented UCB1 (Defence Sentinel)"
        return eval_res
