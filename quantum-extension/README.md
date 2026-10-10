# Quantum Extension for Q-Sentinel: Scanning-Slot Optimization

This module extends the **Defence Sentinel** surveillance system with a Quantum Approximate Optimization Algorithm (QAOA) resource-allocation prototype implemented in **IBM Qiskit**.

## Structure
- `src/optimization_model.py`: Mathematical QUBO formulation for constrained frequency scanning-slot assignment.
- `src/qaoa_solver.py`: Parameterized QAOA ansatz ($p=1, 2$) and classical optimization loop (COBYLA) via Qiskit's `StatevectorSampler`.
- `src/classical_baseline.py`: Exact brute-force optimizer, greedy heuristic, and Defence Sentinel Recency-Augmented UCB1 scheduler.
- `src/experiment_runner.py`: End-to-end benchmark runner comparing all methods and generating comparison charts.
- `tests/`: 9 automated unit tests verifying constraint feasibility, baseline solutions, and circuit dimensions.
- `results/`: Quantitative metrics JSON, benchmark comparison chart, and QAOA circuit diagram.

## Requirements
```bash
pip install -r requirements.txt
```

## Running Benchmarks
```bash
python src/experiment_runner.py
```

## Running Unit Tests
```bash
python -m unittest discover -s tests -v
```
