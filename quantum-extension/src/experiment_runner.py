"""
Comprehensive Experiment Runner:
Executes comparative benchmarks across:
1. Exact Classical Brute Force (Global Optimum)
2. Greedy Classical Heuristic
3. Defence Sentinel Recency-Augmented UCB1
4. Qiskit QAOA Simulator (p=1, p=2)

Generates:
- Detailed JSON metrics
- Tabular text report
- Circuit diagram export (PNG/text)
- Comparison charts (PNG)
"""

import os
import sys
import json
import time
import numpy as np
import matplotlib.pyplot as plt

# Ensure local imports work
sys.path.append(os.path.dirname(__file__))

from optimization_model import create_default_scenario, ScanningOptimizationModel, BandProfile
from classical_baseline import ClassicalSolvers
from qaoa_solver import QAOASolver

def run_benchmarks():
    print("=" * 70)
    print("Q-SENTINEL: QUANTUM-ENHANCED ADAPTIVE SURVEILLANCE & ALLOCATION")
    print("Executing Benchmark Suite: Classical vs. Qiskit QAOA")
    print("=" * 70)

    model = create_default_scenario()
    classical = ClassicalSolvers(model)

    print(f"\nScenario Configuration:")
    print(f"  Candidate Bands: {model.num_bands}")
    for b in model.bands:
        print(f"    - Band {b.band_id}: {b.name} ({b.freq_range_mhz}) | Prio={b.priority}, Urg={b.urgency}, Act={b.activity_prob}, Cost={b.scan_cost} -> Net Util={model.get_band_utility(b):.3f}")
    print(f"  Available Slots: {model.num_slots}")
    print(f"  Resource Budget: {model.budget}")
    print(f"  Total Qubits: {model.num_qubits} (Search space = 2^{model.num_qubits} = {2**model.num_qubits} states)")

    # 1. Classical Exact
    t0 = time.time()
    exact_res = classical.solve_exact()
    t_exact = time.time() - t0
    print(f"\n[1] Classical Exact Solver Completed ({t_exact*1000:.2f} ms):")
    print(f"    Best Bitstring: {exact_res['best_feasible_solution']['bitstring']}")
    print(f"    Allocated Bands: {exact_res['best_feasible_solution']['allocated_bands']}")
    print(f"    Utility Score: {exact_res['best_feasible_solution']['pure_utility']}")
    print(f"    QUBO Energy: {exact_res['best_feasible_solution']['qubo_energy']}")
    print(f"    Feasible Bitstrings in Space: {exact_res['total_feasible_count']} / {exact_res['search_space_size']}")

    # 2. Classical Greedy
    t0 = time.time()
    greedy_res = classical.solve_greedy()
    t_greedy = time.time() - t0
    print(f"\n[2] Classical Greedy Solver Completed ({t_greedy*1000:.2f} ms):")
    print(f"    Best Bitstring: {greedy_res['bitstring']}")
    print(f"    Allocated Bands: {greedy_res['allocated_bands']}")
    print(f"    Utility Score: {greedy_res['pure_utility']}")
    print(f"    Feasible: {greedy_res['is_feasible']}")

    # 3. Defence Sentinel Recency-Augmented UCB1
    t0 = time.time()
    ucb1_res = classical.simulate_recency_ucb1_batch()
    t_ucb1 = time.time() - t0
    print(f"\n[3] Recency-Augmented UCB1 Completed ({t_ucb1*1000:.2f} ms):")
    print(f"    Best Bitstring: {ucb1_res['bitstring']}")
    print(f"    Allocated Bands: {ucb1_res['allocated_bands']}")
    print(f"    Utility Score: {ucb1_res['pure_utility']}")
    print(f"    Feasible: {ucb1_res['is_feasible']}")

    # 4. Qiskit QAOA (p=1)
    print(f"\n[4] Running Qiskit QAOA (p=1 layer, 1000 shots)...")
    t0 = time.time()
    qaoa_p1 = QAOASolver(model, p_layers=1)
    qaoa_p1_res = qaoa_p1.solve(maxiter=25, shots=1000, seed=42)
    t_qaoa_p1 = time.time() - t0
    print(f"    QAOA p=1 Completed in {t_qaoa_p1:.2f} s")
    print(f"    Feasible Solution Rate: {qaoa_p1_res['feasible_rate']*100:.1f}%")
    if qaoa_p1_res['best_feasible_solution']:
        print(f"    Best Feasible Bitstring: {qaoa_p1_res['best_feasible_solution']['bitstring']}")
        print(f"    Allocated Bands: {qaoa_p1_res['best_feasible_solution']['allocated_bands']}")
        print(f"    Utility Score: {qaoa_p1_res['best_feasible_solution']['pure_utility']}")

    # 5. Qiskit QAOA (p=2)
    print(f"\n[5] Running Qiskit QAOA (p=2 layers, 1500 shots)...")
    t0 = time.time()
    qaoa_p2 = QAOASolver(model, p_layers=2)
    qaoa_p2_res = qaoa_p2.solve(maxiter=35, shots=1500, seed=123)
    t_qaoa_p2 = time.time() - t0
    print(f"    QAOA p=2 Completed in {t_qaoa_p2:.2f} s")
    print(f"    Feasible Solution Rate: {qaoa_p2_res['feasible_rate']*100:.1f}%")
    if qaoa_p2_res['best_feasible_solution']:
        print(f"    Best Feasible Bitstring: {qaoa_p2_res['best_feasible_solution']['bitstring']}")
        print(f"    Allocated Bands: {qaoa_p2_res['best_feasible_solution']['allocated_bands']}")
        print(f"    Utility Score: {qaoa_p2_res['best_feasible_solution']['pure_utility']}")

    # Save Results
    results_dir = os.path.join(os.path.dirname(__file__), "..", "results")
    os.makedirs(results_dir, exist_ok=True)

    summary_data = {
        "scenario": {
            "num_bands": model.num_bands,
            "num_slots": model.num_slots,
            "budget": model.budget,
            "qubits": model.num_qubits,
            "search_space": 2 ** model.num_qubits
        },
        "exact_classical": {
            "utility": exact_res['best_feasible_solution']['pure_utility'],
            "energy": exact_res['best_feasible_solution']['qubo_energy'],
            "bitstring": exact_res['best_feasible_solution']['bitstring'],
            "allocated_bands": exact_res['best_feasible_solution']['allocated_bands'],
            "feasible_rate": 1.0,
            "runtime_ms": round(t_exact * 1000, 2)
        },
        "greedy_classical": {
            "utility": greedy_res['pure_utility'],
            "energy": greedy_res['qubo_energy'],
            "bitstring": greedy_res['bitstring'],
            "allocated_bands": greedy_res['allocated_bands'],
            "feasible_rate": 1.0,
            "runtime_ms": round(t_greedy * 1000, 2)
        },
        "recency_ucb1": {
            "utility": ucb1_res['pure_utility'],
            "energy": ucb1_res['qubo_energy'],
            "bitstring": ucb1_res['bitstring'],
            "allocated_bands": ucb1_res['allocated_bands'],
            "feasible_rate": 1.0,
            "runtime_ms": round(t_ucb1 * 1000, 2)
        },
        "qaoa_p1": {
            "feasible_rate": qaoa_p1_res['feasible_rate'],
            "best_feasible_utility": qaoa_p1_res['best_feasible_solution']['pure_utility'] if qaoa_p1_res['best_feasible_solution'] else None,
            "best_feasible_bitstring": qaoa_p1_res['best_feasible_solution']['bitstring'] if qaoa_p1_res['best_feasible_solution'] else None,
            "best_feasible_bands": qaoa_p1_res['best_feasible_solution']['allocated_bands'] if qaoa_p1_res['best_feasible_solution'] else None,
            "runtime_sec": round(t_qaoa_p1, 2),
            "top_bitstrings": qaoa_p1_res['top_bitstrings']
        },
        "qaoa_p2": {
            "feasible_rate": qaoa_p2_res['feasible_rate'],
            "best_feasible_utility": qaoa_p2_res['best_feasible_solution']['pure_utility'] if qaoa_p2_res['best_feasible_solution'] else None,
            "best_feasible_bitstring": qaoa_p2_res['best_feasible_solution']['bitstring'] if qaoa_p2_res['best_feasible_solution'] else None,
            "best_feasible_bands": qaoa_p2_res['best_feasible_solution']['allocated_bands'] if qaoa_p2_res['best_feasible_solution'] else None,
            "runtime_sec": round(t_qaoa_p2, 2),
            "top_bitstrings": qaoa_p2_res['top_bitstrings']
        }
    }

    with open(os.path.join(results_dir, "experiment_results.json"), "w") as f:
        json.dump(summary_data, f, indent=2)

    # Generate Visualization Chart
    chart_path = os.path.join(results_dir, "benchmark_comparison.png")
    generate_comparison_chart(summary_data, chart_path)

    # Export Circuit Diagram
    circuit_path = os.path.join(results_dir, "qaoa_circuit_diagram.png")
    try:
        qaoa_p1.create_qaoa_circuit([0.5], [0.3]).draw(output='mpl', filename=circuit_path)
        print(f"Generated circuit diagram at: {circuit_path}")
    except Exception as e:
        print(f"Note on circuit mpl export: {e}")

    print(f"\nAll experiments successfully completed! Results saved to {results_dir}")
    return summary_data

def generate_comparison_chart(data: dict, output_path: str):
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(11, 4.5), dpi=150)

    # 1. Utility Score Comparison
    methods = ['Exact Opt', 'Greedy', 'Recency-UCB1', 'QAOA (p=1)', 'QAOA (p=2)']
    utilities = [
        data['exact_classical']['utility'],
        data['greedy_classical']['utility'],
        data['recency_ucb1']['utility'],
        data['qaoa_p1']['best_feasible_utility'],
        data['qaoa_p2']['best_feasible_utility']
    ]
    colors = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ec4899']

    bars1 = ax1.bar(methods, utilities, color=colors, width=0.55, edgecolor='black', linewidth=1)
    ax1.set_title('Allocation Objective Utility (Higher = Better)', fontsize=11, fontweight='bold', pad=10)
    ax1.set_ylabel('Priority-Weighted Utility Score', fontsize=10)
    ax1.set_ylim(0, max(utilities) * 1.25)
    ax1.grid(axis='y', linestyle='--', alpha=0.5)

    for bar in bars1:
        yval = bar.get_height()
        ax1.text(bar.get_x() + bar.get_width()/2.0, yval + 0.1, f'{yval:.2f}', ha='center', va='bottom', fontsize=9, fontweight='bold')

    # 2. Feasibility Rate / Probability
    feas_methods = ['Classical Baselines\n(Exact/Greedy/UCB1)', 'QAOA (p=1)\nSampler Output', 'QAOA (p=2)\nSampler Output']
    feas_rates = [
        100.0,
        data['qaoa_p1']['feasible_rate'] * 100,
        data['qaoa_p2']['feasible_rate'] * 100
    ]
    colors2 = ['#10b981', '#f59e0b', '#ec4899']

    bars2 = ax2.bar(feas_methods, feas_rates, color=colors2, width=0.45, edgecolor='black', linewidth=1)
    ax2.set_title('Constraint Feasibility Rate (%)', fontsize=11, fontweight='bold', pad=10)
    ax2.set_ylabel('Valid Feasible Allocations (%)', fontsize=10)
    ax2.set_ylim(0, 115)
    ax2.grid(axis='y', linestyle='--', alpha=0.5)

    for bar in bars2:
        yval = bar.get_height()
        ax2.text(bar.get_x() + bar.get_width()/2.0, yval + 2, f'{yval:.1f}%', ha='center', va='bottom', fontsize=9, fontweight='bold')

    plt.suptitle('Q-Sentinel Experimental Benchmark: Classical vs. Qiskit QAOA', fontsize=13, fontweight='bold')
    plt.tight_layout()
    plt.savefig(output_path, bbox_inches='tight')
    plt.close()
    print(f"Generated comparison chart at: {output_path}")

if __name__ == "__main__":
    run_benchmarks()
