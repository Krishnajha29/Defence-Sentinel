/**
 * ESM-ASTRA: Recency-Augmented UCB1 Scheduler (SIH26055)
 * Credibility-First Explainable Decision Model
 * 
 * Mathematical Formulation:
 * 1. Empirical Mean Reward:
 *    mu_hat = hits / visits (if visits == 0, Q = +Infinity to force initial survey)
 * 2. UCB Exploration Bonus:
 *    U_b = c * sqrt(ln(totalVisits) / visits)
 * 3. Bounded Temporal Recency:
 *    R_b = lambda * tanh(deltaTime / tau)
 * 4. Composite Score:
 *    Q(b) = mu_hat + U_b + R_b
 * 
 * Beta-Bernoulli Posterior:
 *    Prior: Beta(alpha_0=1, beta_0=1)
 *    Update: HIT -> alpha += 1, MISS -> beta += 1
 *    Expected Activity Probability: E[p_b] = alpha / (alpha + beta)
 * 
 * Ablation Modes:
 * - FULL_ADAPTIVE: mu_hat + U_b + R_b (UCB + Temporal Belief)
 * - UCB_ONLY:      mu_hat + U_b (Stationary Bandit without recency aging)
 * - NO_EXPLORATION: mu_hat (Pure greedy exploitation, c=0, lambda=0)
 * - OPEN_LOOP:     Deterministic round-robin sequential scanner
 */

class RecencyAugmentedUCB1Scheduler {
  constructor(options = {}) {
    this.bands = options.bands || [9.180, 9.310, 9.420, 9.675, 9.810];
    this.explorationConstant = options.explorationConstant !== undefined ? options.explorationConstant : Math.SQRT2; // c = sqrt(2)
    this.recencyLambda = options.recencyLambda !== undefined ? options.recencyLambda : 0.20;
    this.recencyTau = options.recencyTau !== undefined ? options.recencyTau : 5.0; // seconds
    this.dwellMs = options.dwellMs || 180;
    this.ablationMode = options.ablationMode || 'FULL_ADAPTIVE'; // FULL_ADAPTIVE, UCB_ONLY, NO_EXPLORATION, OPEN_LOOP

    this.decisionCounter = 0;
    this.openLoopIndex = 0;
    this.decisionHistory = [];

    this.reset();
  }

  setAblationMode(mode) {
    const valid = ['FULL_ADAPTIVE', 'UCB_ONLY', 'NO_EXPLORATION', 'OPEN_LOOP'];
    if (valid.includes(mode)) {
      this.ablationMode = mode;
    }
    return this.ablationMode;
  }

  reset() {
    this.totalVisits = 0;
    this.lastSelectedBand = this.bands[0];
    this.lastFeedback = null;
    this.openLoopIndex = 0;

    this.arms = {};
    this.bands.forEach(b => {
      this.arms[b] = {
        freqGhz: b,
        visits: 0,
        hits: 0,
        misses: 0,
        alpha: 1.0, // Beta distribution prior parameter (successes)
        beta: 1.0,  // Beta distribution prior parameter (failures)
        empiricalReward: 0.0,
        uncertainty: Infinity,
        recency: 0.0,
        lastVisitedTimeSec: -Infinity,
        lastOutcome: null
      };
    });
  }

  getPolicyLabel() {
    switch (this.ablationMode) {
      case 'FULL_ADAPTIVE':
        return 'UCB + TEMPORAL BELIEF (FULL ADAPTIVE)';
      case 'UCB_ONLY':
        return 'UCB ONLY (STATIONARY BANDIT)';
      case 'NO_EXPLORATION':
        return 'NO EXPLORATION (GREEDY EXPLOITATION)';
      case 'OPEN_LOOP':
        return 'OPEN LOOP (SEQUENTIAL ROUND-ROBIN)';
      default:
        return 'UCB + TEMPORAL BELIEF';
    }
  }

  // Action Selection: argmax Q(b) with Complete Decision Trace
  selectBand(currentTimeSec = 0) {
    this.decisionCounter++;
    const decisionId = `DEC-#${String(this.decisionCounter).padStart(4, '0')}`;
    const timestamp = new Date().toTimeString().split(' ')[0];

    // =========================================================================
    // Mode 1: OPEN_LOOP Sequential Scanning
    // =========================================================================
    if (this.ablationMode === 'OPEN_LOOP') {
      const selectedBand = this.bands[this.openLoopIndex % this.bands.length];
      this.openLoopIndex++;
      this.lastSelectedBand = selectedBand;

      const candidateScores = this.bands.map(b => ({
        band: b,
        freqGhz: b,
        score: b === selectedBand ? 1.0 : 0.0,
        estimatedReward: this.arms[b].visits > 0 ? Number((this.arms[b].hits / this.arms[b].visits).toFixed(3)) : 0.0,
        explorationBonus: 0.0,
        aging: this.arms[b].lastVisitedTimeSec !== -Infinity ? Number(Math.max(0, currentTimeSec - this.arms[b].lastVisitedTimeSec).toFixed(2)) : 0.0,
        activityProbability: Number((this.arms[b].alpha / (this.arms[b].alpha + this.arms[b].beta)).toFixed(3))
      }));

      const decisionRecord = {
        decisionId,
        timestamp,
        timeSec: Number(currentTimeSec.toFixed(2)),
        selectedBand,
        dwell: `${this.dwellMs} ms`,
        dwellMs: this.dwellMs,
        candidateScores,
        selectedScore: 1.0,
        reasoning: `Open-Loop cyclic scan step: deterministically selected channel ${selectedBand.toFixed(3)} GHz (Channel ${(this.openLoopIndex - 1) % this.bands.length + 1} of ${this.bands.length}).`,
        topFactors: ['Sequential Index', 'Blind Cyclic Sweep'],
        previousOutcome: this.lastFeedback || 'INITIAL_SURVEY',
        policy: this.getPolicyLabel()
      };

      this.decisionHistory.unshift(decisionRecord);
      if (this.decisionHistory.length > 50) this.decisionHistory.pop();

      return {
        selectedBand,
        score: 1.0,
        dwellMs: this.dwellMs,
        predictedProbability: 0.20,
        decisionRecord,
        candidateScores,
        policy: this.getPolicyLabel(),
        attribution: this.computeAttribution(selectedBand, { mu_hat: 0.2, ucbBonus: 0, recency: 0, bayesProb: 0.2, Q: 1.0 }),
        allBandStats: this.getPerBandState(currentTimeSec),
        perBandState: this.getPerBandState(currentTimeSec)
      };
    }

    // =========================================================================
    // Mode 2, 3, 4: UCB / Greedy / Full Adaptive
    // =========================================================================

    // 1. Initial survey: Prioritize any unvisited band (+Infinity)
    for (const b of this.bands) {
      if (this.arms[b].visits === 0) {
        this.lastSelectedBand = b;

        const candidateScores = this.bands.map(cand => ({
          band: cand,
          freqGhz: cand,
          score: this.arms[cand].visits === 0 ? 999.9 : Number((this.arms[cand].hits / this.arms[cand].visits).toFixed(3)),
          estimatedReward: 0.0,
          explorationBonus: this.arms[cand].visits === 0 ? 999.9 : 0.0,
          aging: 0.0,
          activityProbability: 0.50
        }));

        const decisionRecord = {
          decisionId,
          timestamp,
          timeSec: Number(currentTimeSec.toFixed(2)),
          selectedBand: b,
          dwell: `${this.dwellMs} ms`,
          dwellMs: this.dwellMs,
          candidateScores,
          selectedScore: 999.9,
          reasoning: `Unvisited channel audit: channel ${b.toFixed(3)} GHz has 0 visits. Guaranteed +Infinity priority to complete baseline survey.`,
          topFactors: ['Unvisited Band Survey', 'Uncertainty Maximization'],
          previousOutcome: this.lastFeedback || 'INITIAL_SURVEY',
          policy: this.getPolicyLabel()
        };

        this.decisionHistory.unshift(decisionRecord);
        if (this.decisionHistory.length > 50) this.decisionHistory.pop();

        const unvisitedOthers = this.bands.filter(cand => cand !== b && this.arms[cand].visits === 0);
        const predictedNextBand = unvisitedOthers.length > 0 ? unvisitedOthers[0] : (this.bands.find(cand => cand !== b) || b);

        return {
          selectedBand: b,
          predictedNextBand,
          score: Infinity,
          dwellMs: this.dwellMs,
          predictedProbability: 0.5,
          decisionRecord,
          candidateScores,
          policy: this.getPolicyLabel(),
          attribution: {
            bandGhz: b,
            empiricalReward: 0,
            ucbBonus: Infinity,
            recency: 0,
            totalScore: Infinity,
            policy: 'Unvisited Band Audit'
          },
          allBandStats: this.getPerBandState(currentTimeSec),
          perBandState: this.getPerBandState(currentTimeSec)
        };
      }
    }

    let bestBand = this.bands[0];
    let maxQ = -Infinity;
    const lnTotal = Math.log(Math.max(1, this.totalVisits));
    const scores = {};
    const candidateScores = [];

    this.bands.forEach(b => {
      const arm = this.arms[b];

      // mu_hat = hits / visits
      const mu_hat = arm.hits / arm.visits;

      // Exploration bonus (suppressed if NO_EXPLORATION)
      let ucbBonus = 0.0;
      if (this.ablationMode !== 'NO_EXPLORATION') {
        ucbBonus = this.explorationConstant * Math.sqrt(lnTotal / arm.visits);
      }

      // Temporal recency aging (active only in FULL_ADAPTIVE)
      let recency = 0.0;
      const dt = Math.max(0, currentTimeSec - arm.lastVisitedTimeSec);
      if (this.ablationMode === 'FULL_ADAPTIVE') {
        recency = this.recencyLambda * Math.tanh(dt / this.recencyTau);
      }

      // Composite Score Q(b)
      const Q = mu_hat + ucbBonus + recency;
      const bayesProb = arm.alpha / (arm.alpha + arm.beta);

      scores[b] = {
        freqGhz: b,
        Q,
        mu_hat,
        ucbBonus,
        recency,
        bayesProb,
        visits: arm.visits,
        hits: arm.hits,
        agingSec: dt
      };

      candidateScores.push({
        band: b,
        freqGhz: b,
        score: Number(Q.toFixed(3)),
        estimatedReward: Number(mu_hat.toFixed(3)),
        explorationBonus: Number(ucbBonus.toFixed(3)),
        aging: Number(dt.toFixed(2)),
        activityProbability: Number(bayesProb.toFixed(3))
      });

      if (Q > maxQ) {
        maxQ = Q;
        bestBand = b;
      }
    });

    this.lastSelectedBand = bestBand;
    const bestInfo = scores[bestBand];

    // Sort candidate scores descending by score
    candidateScores.sort((a, b) => b.score - a.score);

    // Formulate explainable top factors and reasoning sentence
    const topFactors = [];
    if (bestInfo.mu_hat >= 0.35) topFactors.push('Recent Hit / Empirical Reward');
    if (bestInfo.bayesProb >= 0.50) topFactors.push('Activity Probability');
    if (bestInfo.ucbBonus >= 0.20 && this.ablationMode !== 'NO_EXPLORATION') topFactors.push('Uncertainty Bonus');
    if (bestInfo.recency >= 0.05 && this.ablationMode === 'FULL_ADAPTIVE') topFactors.push('Recency Aging Recovery');
    if (topFactors.length === 0) topFactors.push('Composite UCB Score Margin');

    const runnerUp = candidateScores[1];
    const margin = runnerUp ? Number((bestInfo.Q - runnerUp.score).toFixed(3)) : 0;
    const reasoning = `${bestBand.toFixed(3)} GHz selected with score ${bestInfo.Q.toFixed(3)} (+${margin} over ${runnerUp ? runnerUp.band.toFixed(3) : '--'} GHz). Key factors: ${topFactors.join(', ')}.`;

    const decisionRecord = {
      decisionId,
      timestamp,
      timeSec: Number(currentTimeSec.toFixed(2)),
      selectedBand: bestBand,
      dwell: `${this.dwellMs} ms`,
      dwellMs: this.dwellMs,
      candidateScores,
      selectedScore: Number(maxQ.toFixed(3)),
      reasoning,
      topFactors,
      previousOutcome: this.lastFeedback || 'INITIAL_SURVEY',
      policy: this.getPolicyLabel()
    };

    this.decisionHistory.unshift(decisionRecord);
    if (this.decisionHistory.length > 50) this.decisionHistory.pop();

    const predictedNextBand = candidateScores.length > 1 ? candidateScores[1].band : bestBand;

    return {
      selectedBand: bestBand,
      predictedNextBand,
      score: maxQ,
      dwellMs: this.dwellMs,
      predictedProbability: bestInfo.bayesProb,
      scores,
      candidateScores,
      decisionRecord,
      attribution: this.computeAttribution(bestBand, bestInfo),
      allBandStats: this.getPerBandState(currentTimeSec),
      perBandState: this.getPerBandState(currentTimeSec)
    };
  }

  // Compute isolated score breakdown for a specific band at a given timestamp
  scoreBand(b, currentTimeSec = 0) {
    const arm = this.arms[b];
    if (!arm) return { Q: 0, mu_hat: 0, ucbBonus: 0, recency: 0, bayesProb: 0 };
    if (arm.visits === 0) return { Q: Infinity, mu_hat: 0, ucbBonus: Infinity, recency: 0, bayesProb: 0.5 };
    const lnTotal = Math.log(Math.max(1, this.totalVisits));
    const mu_hat = arm.hits / arm.visits;
    let ucbBonus = 0.0;
    if (this.ablationMode !== 'NO_EXPLORATION' && this.ablationMode !== 'OPEN_LOOP') {
      ucbBonus = this.explorationConstant * Math.sqrt(lnTotal / arm.visits);
    }
    let recency = 0.0;
    const dt = Math.max(0, currentTimeSec - arm.lastVisitedTimeSec);
    if (this.ablationMode === 'FULL_ADAPTIVE') {
      recency = this.recencyLambda * Math.tanh(dt / this.recencyTau);
    }
    const Q = mu_hat + ucbBonus + recency;
    const bayesProb = arm.alpha / (arm.alpha + arm.beta);
    return { Q, mu_hat, ucbBonus, recency, bayesProb, visits: arm.visits, hits: arm.hits, agingSec: dt };
  }

  // 10-Attribute Per-Band State Inspection
  getPerBandState(currentTimeSec = 0) {
    const lnTotal = Math.log(Math.max(1, this.totalVisits));

    return this.bands.map(b => {
      const arm = this.arms[b];
      const visits = arm.visits;
      const hits = arm.hits;
      const misses = arm.misses;
      const estimatedReward = visits > 0 ? Number((hits / visits).toFixed(3)) : 0.0;
      const activityProbability = Number((arm.alpha / (arm.alpha + arm.beta)).toFixed(3));

      let explorationBonus = 0.0;
      let uncertainty = 0.0;
      if (visits === 0) {
        explorationBonus = 999.9;
        uncertainty = 999.9;
      } else {
        uncertainty = Number(Math.sqrt(lnTotal / visits).toFixed(3));
        if (this.ablationMode !== 'NO_EXPLORATION' && this.ablationMode !== 'OPEN_LOOP') {
          explorationBonus = Number((this.explorationConstant * Math.sqrt(lnTotal / visits)).toFixed(3));
        }
      }

      const dt = arm.lastVisitedTimeSec !== -Infinity ? Math.max(0, currentTimeSec - arm.lastVisitedTimeSec) : Infinity;
      const aging = dt !== Infinity ? Number(dt.toFixed(2)) : 0.0;
      const lastObserved = arm.lastVisitedTimeSec !== -Infinity ? `${arm.lastVisitedTimeSec.toFixed(1)}s` : 'NEVER';

      let recency = 0.0;
      if (dt !== Infinity && this.ablationMode === 'FULL_ADAPTIVE') {
        recency = Number((this.recencyLambda * Math.tanh(dt / this.recencyTau)).toFixed(3));
      }

      let currentScore = 0.0;
      if (visits === 0) {
        currentScore = 999.9;
      } else if (this.ablationMode === 'OPEN_LOOP') {
        currentScore = b === this.lastSelectedBand ? 1.0 : 0.0;
      } else if (this.ablationMode === 'NO_EXPLORATION') {
        currentScore = estimatedReward;
      } else if (this.ablationMode === 'UCB_ONLY') {
        currentScore = Number((estimatedReward + explorationBonus).toFixed(3));
      } else {
        currentScore = Number((estimatedReward + explorationBonus + recency).toFixed(3));
      }

      return {
        band: b,
        freqGhz: b,
        visits,
        hits,
        misses,
        alpha: arm.alpha,
        beta: arm.beta,
        empiricalReward: estimatedReward,
        estimatedReward,
        posteriorMean: activityProbability,
        activityProbability,
        uncertainty,
        lastObserved,
        aging,
        explorationBonus,
        currentScore,
        lastOutcome: arm.lastOutcome || 'NONE'
      };
    });
  }

  getRecentDecisions(limit = 15) {
    return this.decisionHistory.slice(0, limit);
  }

  getPolicyInspectorState() {
    return {
      currentPolicy: this.getPolicyLabel(),
      ablationMode: this.ablationMode,
      explorationConstant: this.ablationMode === 'NO_EXPLORATION' || this.ablationMode === 'OPEN_LOOP' ? 0.0 : Number(this.explorationConstant.toFixed(3)),
      recencyWeight: this.ablationMode === 'FULL_ADAPTIVE' ? this.recencyLambda : 0.0,
      recencyTauSec: this.recencyTau,
      learningRate: 'Conjugate Beta(α,β) (+1 per dwell)',
      currentBestBand: this.getGreedyBand(),
      systemUncertainty: Number((this.bands.reduce((sum, b) => {
        return sum + (this.arms[b].visits > 0 ? Math.sqrt(Math.log(Math.max(1, this.totalVisits)) / this.arms[b].visits) : 1.0);
      }, 0) / this.bands.length).toFixed(3))
    };
  }

  getGreedyBand() {
    let bestBand = this.bands[0];
    let maxReward = -Infinity;
    this.bands.forEach(b => {
      const arm = this.arms[b];
      const mu = arm.visits > 0 ? arm.hits / arm.visits : 0;
      if (mu > maxReward) {
        maxReward = mu;
        bestBand = b;
      }
    });
    return bestBand;
  }

  computeAttribution(band, scoreInfo) {
    if (!scoreInfo) return { bandGhz: band, empiricalReward: 0, ucbBonus: 0, recency: 0, totalScore: 0, policy: this.getPolicyLabel() };

    const arm = this.arms[band];
    const empiricalRewardScaled = Math.round(scoreInfo.mu_hat * 40);
    const ucbScaled = Math.round(Math.min(30, scoreInfo.ucbBonus * 15));
    const recencyScaled = Math.round(scoreInfo.recency * 100);
    const bayesScaled = Math.round(scoreInfo.bayesProb * 25);
    const totalScore = Math.round(scoreInfo.Q * 50);

    return {
      bandGhz: band,
      activity: bayesScaled,
      recentHit: empiricalRewardScaled,
      uncertainty: ucbScaled,
      recency: recencyScaled,
      exploration: Math.max(2, Math.round(10 / Math.max(1, Math.sqrt(arm ? arm.visits : 1)))),
      missPenalty: arm && arm.lastOutcome === 'MISS' ? -4 : 0,
      totalScore,
      policy: this.getPolicyLabel()
    };
  }

  // Receive feedback upon dwell completion
  observeFeedback(bandGhz, isHit, currentTimeSec = 0) {
    const arm = this.arms[bandGhz];
    if (!arm) return;

    this.totalVisits++;
    arm.visits++;
    arm.lastVisitedTimeSec = currentTimeSec;
    this.lastFeedback = isHit ? 'HIT' : 'MISS';
    arm.lastOutcome = this.lastFeedback;

    if (isHit) {
      arm.hits++;
      arm.alpha += 1.0;
    } else {
      arm.misses++;
      arm.beta += 1.0;
    }

    arm.empiricalReward = arm.hits / arm.visits;
    const lnTotal = Math.log(Math.max(1, this.totalVisits));
    arm.uncertainty = this.explorationConstant * Math.sqrt(lnTotal / arm.visits);
    arm.recency = 0.0;
  }

  getState() {
    return {
      totalVisits: this.totalVisits,
      lastSelectedBand: this.lastSelectedBand,
      lastFeedback: this.lastFeedback,
      ablationMode: this.ablationMode,
      policy: this.getPolicyLabel(),
      arms: Object.values(this.arms).map(a => ({
        freqGhz: a.freqGhz,
        visits: a.visits,
        hits: a.hits,
        misses: a.misses,
        empiricalReward: Number(a.empiricalReward.toFixed(3)),
        bayesProb: Number((a.alpha / (a.alpha + a.beta)).toFixed(3)),
        uncertainty: a.visits > 0 ? Number(a.uncertainty.toFixed(3)) : Infinity
      }))
    };
  }
}

/**
 * Deterministic Hit/Miss Learning Sequence Walkthrough
 * Returns 5 observable steps demonstrating the closed feedback loop:
 * OBSERVATION -> DECISION -> RESULT -> LEARNING -> NEW DECISION
 */
function runHitMissLearningSequence() {
  const bands = [9.180, 9.310, 9.420, 9.675, 9.810];
  const scheduler = new RecencyAugmentedUCB1Scheduler({ bands, explorationConstant: 1.414, recencyLambda: 0.15, recencyTau: 12.0 });

  // Baseline setup:
  // Channels 9.180, 9.310, 9.810 seeded with 5 visits, 0 hits
  [9.180, 9.310, 9.810].forEach(b => {
    for (let v = 0; v < 5; v++) scheduler.observeFeedback(b, false, 1.0 + v * 0.1);
  });
  // Band B (9.675 GHz): 4 visits, 3 hits (v=0,1,2 hit, v=3 miss)
  for (let v = 0; v < 4; v++) {
    scheduler.observeFeedback(9.675, v < 3, 2.0 + v * 0.1);
  }
  // Band A (9.420 GHz): 3 visits, 2 hits (v=0,1 hit, v=2 miss)
  for (let v = 0; v < 3; v++) {
    scheduler.observeFeedback(9.420, v < 2, 2.5 + v * 0.1);
  }

  // Step 1: Initial decision at t = 3.0s selects Band A (9.420 GHz)
  const dec1 = scheduler.selectBand(3.0);
  const qA1 = dec1.candidateScores.find(c => c.band === 9.420)?.score || 0;
  const qB1 = dec1.candidateScores.find(c => c.band === 9.675)?.score || 0;
  const armA1 = scheduler.arms[9.420];
  const armB1 = scheduler.arms[9.675];

  const stateStep1 = {
    step: 1,
    label: 'STEP 1: INITIAL POLICY SELECTS BAND A (9.420 GHz)',
    selectedBand: dec1.selectedBand,
    action: 'Receiver tuned to 9.420 GHz (180 ms Dwell)',
    reasoning: `Band A (9.420 GHz) preferred with score Q=${qA1.toFixed(3)} (+${(qA1 - qB1).toFixed(3)} margin over Band B Q=${qB1.toFixed(3)}). High uncertainty bonus from lower visit count drives initial selection.`,
    scoreA: qA1,
    scoreB: qB1,
    // Explicit 10 attributes for key arms
    armA: {
      visits: armA1.visits, hits: armA1.hits, misses: armA1.misses,
      alpha: armA1.alpha, beta: armA1.beta,
      empiricalReward: Number(armA1.empiricalReward.toFixed(3)),
      posteriorMean: Number((armA1.alpha / (armA1.alpha + armA1.beta)).toFixed(3)),
      ucbBonus: Number(armA1.uncertainty.toFixed(3)),
      recency: Number(armA1.recency.toFixed(3)),
      finalScore: qA1
    },
    armB: {
      visits: armB1.visits, hits: armB1.hits, misses: armB1.misses,
      alpha: armB1.alpha, beta: armB1.beta,
      empiricalReward: Number(armB1.empiricalReward.toFixed(3)),
      posteriorMean: Number((armB1.alpha / (armB1.alpha + armB1.beta)).toFixed(3)),
      ucbBonus: Number(armB1.uncertainty.toFixed(3)),
      recency: Number(armB1.recency.toFixed(3)),
      finalScore: qB1
    },
    candidateScores: dec1.candidateScores,
    perBandState: scheduler.getPerBandState(3.0)
  };

  // Step 2: Dwell on Band A yields EXACTLY ONE MISS at t = 3.2s
  // Invariants: hits unchanged (+0), misses += 1, visits += 1, beta += 1, alpha unchanged
  scheduler.observeFeedback(9.420, false, 3.2);
  const armA2 = scheduler.arms[9.420];
  const armB2 = scheduler.arms[9.675];

  const qA_step2 = scheduler.scoreBand(9.420, 3.2).Q;
  const qB_step2 = scheduler.scoreBand(9.675, 3.2).Q;

  const stateStep2 = {
    step: 2,
    label: 'STEP 2: RECEIVER OBSERVATION (MISS ON BAND A)',
    observation: 'MISS on 9.420 GHz (Zero RF Energy Detected in Dwell)',
    learning: `Conjugate update: misses += 1 (1 ➔ 2), visits += 1 (3 ➔ 4), beta_A += 1 (2 ➔ 3), alpha_A unchanged (3). Empirical reward drops from 0.667 (2/3) to 0.500 (2/4). Posterior mean drops from 0.600 (3/5) to 0.500 (3/6).`,
    selectedBand: 9.420,
    armA: {
      visits: armA2.visits, hits: armA2.hits, misses: armA2.misses,
      alpha: armA2.alpha, beta: armA2.beta,
      empiricalReward: Number(armA2.empiricalReward.toFixed(3)),
      posteriorMean: Number((armA2.alpha / (armA2.alpha + armA2.beta)).toFixed(3)),
      ucbBonus: Number(armA2.uncertainty.toFixed(3)),
      recency: Number(armA2.recency.toFixed(3)),
      finalScore: Number(qA_step2.toFixed(3))
    },
    armB: {
      visits: armB2.visits, hits: armB2.hits, misses: armB2.misses,
      alpha: armB2.alpha, beta: armB2.beta,
      empiricalReward: Number(armB2.empiricalReward.toFixed(3)),
      posteriorMean: Number((armB2.alpha / (armB2.alpha + armB2.beta)).toFixed(3)),
      ucbBonus: Number(armB2.uncertainty.toFixed(3)),
      recency: Number(armB2.recency.toFixed(3)),
      finalScore: Number(qB_step2.toFixed(3))
    },
    perBandState: scheduler.getPerBandState(3.2)
  };

  // Step 3: Decision at t = 3.4s switches to Band B (9.675 GHz)
  const dec2 = scheduler.selectBand(3.4);
  const qA2 = dec2.candidateScores.find(c => c.band === 9.420)?.score || 0;
  const qB2 = dec2.candidateScores.find(c => c.band === 9.675)?.score || 0;
  const armA3 = scheduler.arms[9.420];
  const armB3 = scheduler.arms[9.675];

  const stateStep3 = {
    step: 3,
    label: 'STEP 3: NEW DECISION SWITCHES TO BAND B (9.675 GHz)',
    selectedBand: dec2.selectedBand,
    action: 'Receiver retuned to 9.675 GHz (Synthesizer Lock 180 ms)',
    reasoning: `Score on Band A dropped from Q=${qA1.toFixed(3)} to Q=${qA2.toFixed(3)} (-${(qA1 - qA2).toFixed(3)}). Band B holds highest score Q=${qB2.toFixed(3)} (+${(qB2 - qA2).toFixed(3)} margin over Band A). Causal decision switch executed.`,
    scoreA: qA2,
    scoreB: qB2,
    armA: {
      visits: armA3.visits, hits: armA3.hits, misses: armA3.misses,
      alpha: armA3.alpha, beta: armA3.beta,
      empiricalReward: Number(armA3.empiricalReward.toFixed(3)),
      posteriorMean: Number((armA3.alpha / (armA3.alpha + armA3.beta)).toFixed(3)),
      ucbBonus: Number(armA3.uncertainty.toFixed(3)),
      recency: Number(armA3.recency.toFixed(3)),
      finalScore: qA2
    },
    armB: {
      visits: armB3.visits, hits: armB3.hits, misses: armB3.misses,
      alpha: armB3.alpha, beta: armB3.beta,
      empiricalReward: Number(armB3.empiricalReward.toFixed(3)),
      posteriorMean: Number((armB3.alpha / (armB3.alpha + armB3.beta)).toFixed(3)),
      ucbBonus: Number(armB3.uncertainty.toFixed(3)),
      recency: Number(armB3.recency.toFixed(3)),
      finalScore: qB2
    },
    candidateScores: dec2.candidateScores,
    perBandState: scheduler.getPerBandState(3.4)
  };

  // Step 4: Dwell on Band B yields EXACTLY ONE HIT at t = 3.6s
  // Invariants: hits += 1, misses unchanged (+0), visits += 1, alpha += 1, beta unchanged
  scheduler.observeFeedback(9.675, true, 3.6);
  const armA4 = scheduler.arms[9.420];
  const armB4 = scheduler.arms[9.675];
  const qA_step4 = scheduler.scoreBand(9.420, 3.6).Q;
  const qB_step4 = scheduler.scoreBand(9.675, 3.6).Q;

  const stateStep4 = {
    step: 4,
    label: 'STEP 4: RECEIVER OBSERVATION (HIT ON BAND B)',
    observation: 'HIT on 9.675 GHz (Signal Intercepted, SNR +28.4 dB)',
    learning: `Conjugate update: hits += 1 (3 ➔ 4), visits += 1 (4 ➔ 5), alpha_B += 1 (4 ➔ 5), beta_B unchanged (2). Empirical reward increases from 0.750 (3/4) to 0.800 (4/5). Posterior mean increases from 0.667 (4/6) to 0.714 (5/7).`,
    selectedBand: 9.675,
    armA: {
      visits: armA4.visits, hits: armA4.hits, misses: armA4.misses,
      alpha: armA4.alpha, beta: armA4.beta,
      empiricalReward: Number(armA4.empiricalReward.toFixed(3)),
      posteriorMean: Number((armA4.alpha / (armA4.alpha + armA4.beta)).toFixed(3)),
      ucbBonus: Number(armA4.uncertainty.toFixed(3)),
      recency: Number(armA4.recency.toFixed(3)),
      finalScore: Number(qA_step4.toFixed(3))
    },
    armB: {
      visits: armB4.visits, hits: armB4.hits, misses: armB4.misses,
      alpha: armB4.alpha, beta: armB4.beta,
      empiricalReward: Number(armB4.empiricalReward.toFixed(3)),
      posteriorMean: Number((armB4.alpha / (armB4.alpha + armB4.beta)).toFixed(3)),
      ucbBonus: Number(armB4.uncertainty.toFixed(3)),
      recency: Number(armB4.recency.toFixed(3)),
      finalScore: Number(qB_step4.toFixed(3))
    },
    perBandState: scheduler.getPerBandState(3.6)
  };

  // Step 5: Policy reinforces Band B as primary target at t = 3.8s
  const dec3 = scheduler.selectBand(3.8);
  const qA3 = dec3.candidateScores.find(c => c.band === 9.420)?.score || 0;
  const qB3 = dec3.candidateScores.find(c => c.band === 9.675)?.score || 0;
  const armA5 = scheduler.arms[9.420];
  const armB5 = scheduler.arms[9.675];

  const stateStep5 = {
    step: 5,
    label: 'STEP 5: POLICY REINFORCES BAND B AS HIGHEST VALUE',
    selectedBand: dec3.selectedBand,
    action: 'Dwell lock maintained on 9.675 GHz',
    reasoning: `Band B (9.675 GHz) confirmed as primary target with reinforced score Q=${qB3.toFixed(3)} (+${(qB3 - qA3).toFixed(3)} margin over Band A Q=${qA3.toFixed(3)}). Empirical reward reached 0.800 (4/5). Closed loop complete.`,
    scoreA: qA3,
    scoreB: qB3,
    armA: {
      visits: armA5.visits, hits: armA5.hits, misses: armA5.misses,
      alpha: armA5.alpha, beta: armA5.beta,
      empiricalReward: Number(armA5.empiricalReward.toFixed(3)),
      posteriorMean: Number((armA5.alpha / (armA5.alpha + armA5.beta)).toFixed(3)),
      ucbBonus: Number(armA5.uncertainty.toFixed(3)),
      recency: Number(armA5.recency.toFixed(3)),
      finalScore: qA3
    },
    armB: {
      visits: armB5.visits, hits: armB5.hits, misses: armB5.misses,
      alpha: armB5.alpha, beta: armB5.beta,
      empiricalReward: Number(armB5.empiricalReward.toFixed(3)),
      posteriorMean: Number((armB5.alpha / (armB5.alpha + armB5.beta)).toFixed(3)),
      ucbBonus: Number(armB5.uncertainty.toFixed(3)),
      recency: Number(armB5.recency.toFixed(3)),
      finalScore: qB3
    },
    candidateScores: dec3.candidateScores,
    perBandState: scheduler.getPerBandState(3.8)
  };

  return {
    title: 'DETERMINISTIC HIT/MISS LEARNING CLOSED LOOP',
    steps: [stateStep1, stateStep2, stateStep3, stateStep4, stateStep5]
  };
}

/**
 * Baseline: Open-Loop Sequential Scanner (Deterministic Round-Robin)
 * Cycles through channels 1..K in fixed order.
 */
class OpenLoopSequentialScheduler {
  constructor(options = {}) {
    this.bands = options.bands || [9.180, 9.310, 9.420, 9.675, 9.810];
    this.dwellMs = options.dwellMs || 180;
    this.currentIndex = 0;
    this.reset();
  }

  reset() {
    this.currentIndex = 0;
    this.totalVisits = 0;
    this.totalHits = 0;
    this.totalMisses = 0;
  }

  selectBand() {
    const band = this.bands[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.bands.length;
    return {
      selectedBand: band,
      dwellMs: this.dwellMs,
      policy: 'Open-Loop Sequential Scanner'
    };
  }

  observeFeedback(bandGhz, isHit) {
    this.totalVisits++;
    if (isHit) {
      this.totalHits++;
    } else {
      this.totalMisses++;
    }
  }

  getState() {
    return {
      totalVisits: this.totalVisits,
      totalHits: this.totalHits,
      totalMisses: this.totalMisses,
      hitRate: this.totalVisits > 0 ? Number(((this.totalHits / this.totalVisits) * 100).toFixed(1)) : 0
    };
  }
}

module.exports = {
  RecencyAugmentedUCB1Scheduler,
  AdaptiveScanScheduler: RecencyAugmentedUCB1Scheduler, // Backward compatibility alias
  OpenLoopSequentialScheduler,
  runHitMissLearningSequence
};
