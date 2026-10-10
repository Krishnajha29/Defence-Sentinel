"""
Q-Sentinel Optimization Model: Constrained Binary Scanning-Slot Allocation
Formulation:
  Decision variables:
    x_{b,t} in {0, 1}: 1 if candidate frequency band b is allocated scanning slot t, else 0.
    b in {0, ..., B-1}, t in {0, ..., T-1} -> N = B * T qubits/variables.

  Objective:
    Maximize Priority-Weighted Utility - Scanning Cost:
      Maximize sum_{b,t} (w_p * Priority_b + w_u * Urgency_b + w_a * Activity_b - w_c * Cost_b) * x_{b,t}
    Equivalently, Minimize:
      H_obj(x) = sum_{b,t} C_{b,t} * x_{b,t}
      where C_{b,t} = - (w_p * Priority_b + w_u * Urgency_b + w_a * Activity_b - w_c * Cost_b)

  Hard Constraints:
    1. Slot Uniqueness: Each time slot t can be assigned to at most one band:
       sum_b x_{b,t} <= 1  for all t.
       (If slots are fully utilized: sum_b x_{b,t} = 1, but <= 1 allows idle if beneficial).
       Penalty: P_slot * sum_t (sum_b x_{b,t} - 1)^2 if equality, or pair collisions sum_{b < b'} x_{b,t} x_{b',t}.
       In QUBO, collision penalty for slot t: P_collision * sum_{b < b'} x_{b,t} x_{b',t}.

    2. Total Budget Constraint: Total scanning assignments across all slots <= K (Budget):
       sum_{b,t} x_{b,t} <= K.
       If T = K (we have K slots and we want to assign exactly K slots):
       Penalty: P_budget * (sum_{b,t} x_{b,t} - K)^2.

    3. Band Revisit Limit: A single band b shouldn't monopolize all slots:
       sum_t x_{b,t} <= MaxDwell_b.
       Penalty: P_dwell * sum_{t < t'} x_{b,t} x_{b,t'} if MaxDwell_b == 1.

  QUBO Matrix Construction:
    Minimize x^T Q x + c^T x
    where x is binary vector of length N = B * T.
"""

import numpy as np
from dataclasses import dataclass
from typing import List, Dict, Tuple

@dataclass
class BandProfile:
    band_id: int
    name: str
    freq_range_mhz: str
    priority: float      # [0, 1] e.g. based on threat level / intelligence
    urgency: float       # [0, 1] e.g. time since last scanned (recency urgency)
    activity_prob: float # [0, 1] e.g. estimated emitter activity probability
    scan_cost: float     # [0, 1] e.g. receiver tuning time / energy cost

class ScanningOptimizationModel:
    def __init__(
        self,
        bands: List[BandProfile],
        num_slots: int = 2,
        budget: int = 2,
        w_priority: float = 1.0,
        w_urgency: float = 0.8,
        w_activity: float = 0.7,
        w_cost: float = 0.3,
        penalty_slot: float = 8.0,
        penalty_budget: float = 6.0,
        penalty_dwell: float = 4.0
    ):
        self.bands = bands
        self.num_bands = len(bands)
        self.num_slots = num_slots
        self.budget = budget
        self.w_p = w_priority
        self.w_u = w_urgency
        self.w_a = w_activity
        self.w_c = w_cost
        self.p_slot = penalty_slot
        self.p_budget = penalty_budget
        self.p_dwell = penalty_dwell
        self.num_qubits = self.num_bands * self.num_slots

    def get_var_index(self, b: int, t: int) -> int:
        return b * self.num_slots + t

    def get_band_utility(self, band: BandProfile) -> float:
        return (
            self.w_p * band.priority +
            self.w_u * band.urgency +
            self.w_a * band.activity_prob -
            self.w_c * band.scan_cost
        )

    def build_qubo(self) -> Tuple[np.ndarray, np.ndarray, float]:
        """
        Builds upper-triangular QUBO matrix Q such that Cost(x) = x^T Q x + offset.
        Returns:
            Q: (N, N) matrix
            linear_terms: (N,) vector
            offset: float
        """
        N = self.num_qubits
        Q = np.zeros((N, N), dtype=float)
        offset = 0.0

        # 1. Objective: Minimize - Utility (Maximize Utility)
        for b, band in enumerate(self.bands):
            utility = self.get_band_utility(band)
            for t in range(self.num_slots):
                idx = self.get_var_index(b, t)
                # Linear objective contribution
                Q[idx, idx] -= utility

        # 2. Constraint: At most 1 band per slot t -> Penalize collisions
        # sum_{b < b'} x_{b,t} * x_{b',t} * P_slot
        for t in range(self.num_slots):
            for b1 in range(self.num_bands):
                idx1 = self.get_var_index(b1, t)
                for b2 in range(b1 + 1, self.num_bands):
                    idx2 = self.get_var_index(b2, t)
                    Q[idx1, idx2] += self.p_slot

        # 3. Constraint: Total assignments exactly equal to budget (or <= budget)
        # Using equality penalty P_budget * (sum_i x_i - budget)^2
        # = P_budget * [ (sum_i x_i)^2 - 2 * budget * sum_i x_i + budget^2 ]
        # = P_budget * [ sum_i x_i + 2 * sum_{i < j} x_i x_j - 2 * budget * sum_i x_i + budget^2 ]
        # Linear part: P_budget * (1 - 2 * budget) * x_i
        # Quadratic part: 2 * P_budget * x_i x_j
        # Offset: P_budget * budget^2
        offset += self.p_budget * (self.budget ** 2)
        linear_budget = self.p_budget * (1.0 - 2.0 * self.budget)
        for i in range(N):
            Q[i, i] += linear_budget
            for j in range(i + 1, N):
                Q[i, j] += 2.0 * self.p_budget

        # 4. Constraint: Band diversity (MaxDwell = 1 per cycle for distinct coverage)
        # sum_{t < t'} x_{b,t} * x_{b,t'} * P_dwell
        for b in range(self.num_bands):
            for t1 in range(self.num_slots):
                idx1 = self.get_var_index(b, t1)
                for t2 in range(t1 + 1, self.num_slots):
                    idx2 = self.get_var_index(b, t2)
                    Q[idx1, idx2] += self.p_dwell

        return Q, np.diag(Q), offset

    def evaluate_solution(self, x: np.ndarray) -> Dict:
        """
        Evaluates a binary vector x in {0, 1}^N against constraints and pure utility.
        """
        N = self.num_qubits
        if len(x) != N:
            raise ValueError(f"Expected binary vector of length {N}, got {len(x)}")

        allocation_grid = x.reshape((self.num_bands, self.num_slots))

        total_scans = int(np.sum(x))
        slot_counts = np.sum(allocation_grid, axis=0) # count per slot
        band_counts = np.sum(allocation_grid, axis=1) # count per band

        # Check constraints
        slot_collision = any(c > 1 for c in slot_counts)
        slot_empty = any(c == 0 for c in slot_counts)
        budget_satisfied = (total_scans == self.budget)
        band_overdwell = any(c > 1 for c in band_counts)

        is_feasible = (not slot_collision) and budget_satisfied and (not band_overdwell)

        # Pure domain utility (without penalty)
        pure_utility = 0.0
        allocated_bands = []
        for b, band in enumerate(self.bands):
            if band_counts[b] > 0:
                pure_utility += self.get_band_utility(band) * band_counts[b]
                allocated_bands.append(band.name)

        # QUBO Hamiltonian energy (lower is better)
        Q, _, offset = self.build_qubo()
        qubo_energy = float(x.T @ Q @ x + offset)

        return {
            "bitstring": "".join(str(int(bit)) for bit in x),
            "allocation_grid": allocation_grid.tolist(),
            "total_scans": total_scans,
            "allocated_bands": allocated_bands,
            "slot_counts": slot_counts.tolist(),
            "band_counts": band_counts.tolist(),
            "is_feasible": is_feasible,
            "slot_collision": slot_collision,
            "budget_satisfied": budget_satisfied,
            "band_overdwell": band_overdwell,
            "pure_utility": round(float(pure_utility), 4),
            "qubo_energy": round(qubo_energy, 4)
        }

def create_default_scenario() -> ScanningOptimizationModel:
    """
    Standard test scenario representing 4 candidate tactical RF bands:
    - Band 0: VHF Tactical (Convoy radio, high priority, moderate urgency)
    - Band 1: UHF Command (Drone uplink, critical priority, high urgency)
    - Band 2: L-Band Radar (Telemetry, low priority, low urgency)
    - Band 3: S-Band ESM (Surveillance radar, medium priority, high urgency)
    Resource budget: 2 scanning slots out of 4 candidate bands.
    Total qubits = 4 * 2 = 8 qubits.
    """
    bands = [
        BandProfile(0, "VHF Tactical", "30-88 MHz", priority=0.85, urgency=0.70, activity_prob=0.80, scan_cost=0.20),
        BandProfile(1, "UHF Command", "225-400 MHz", priority=0.95, urgency=0.90, activity_prob=0.85, scan_cost=0.25),
        BandProfile(2, "L-Band Telemetry", "1-2 GHz", priority=0.30, urgency=0.20, activity_prob=0.15, scan_cost=0.40),
        BandProfile(3, "S-Band Surveillance", "2-4 GHz", priority=0.75, urgency=0.80, activity_prob=0.60, scan_cost=0.30)
    ]
    return ScanningOptimizationModel(bands, num_slots=2, budget=2)
