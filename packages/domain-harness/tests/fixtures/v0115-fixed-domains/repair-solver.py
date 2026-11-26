"""Qualification-only domain adapter; not an SDK dependency."""
import json
import sys
import numpy as np
from scipy.optimize import milp, Bounds, LinearConstraint
from scipy import __version__

def solve(request):
    jobs = request["jobs"]
    deadline = request["deadline"]
    horizon = request["horizon"]
    if len(jobs) != 3 or not 0 <= deadline <= horizon <= 8:
        raise ValueError("invalid scheduling demand")
    choices = [(i, k, t) for i, j in enumerate(jobs) for k in ("I", "R")
               for t in range(j["release"], horizon-j[k]+1)]
    m = len(choices)
    n = m+1
    rows, lo, hi = [], [], []
    def add(a, l, u):
        rows.append(a)
        lo.append(l)
        hi.append(u)
    for i, j in enumerate(jobs):
        for k in ("I", "R"):
            a = np.zeros(n)
            a[:m] = [int(ii==i and kk==k) for ii, kk, t in choices]
            add(a, 1, 1)
        a = np.zeros(n)
        a[:m] = [(t+j["I"] if k=="I" else -t) if ii==i else 0 for ii,k,t in choices]
        add(a, -np.inf, 0)
        a = np.zeros(n)
        a[:m] = [t+j["R"] if ii==i and k=="R" else 0 for ii,k,t in choices]
        a[m] = -1
        add(a, -np.inf, 0)
    for k in ("I", "R"):
        for h in range(horizon):
            a = np.zeros(n)
            a[:m] = [int(kk==k and t<=h<t+jobs[i][k]) for i,kk,t in choices]
            add(a, 0, 1)
    c = np.zeros(n)
    c[:m] = [t+jobs[i]["R"] if k=="R" else 0 for i,k,t in choices]
    c[m] = 100
    result = milp(c, integrality=np.ones(n),
                  bounds=Bounds(np.zeros(n), np.r_[np.ones(m), deadline]),
                  constraints=LinearConstraint(np.array(rows), lo, hi),
                  options={"time_limit": 10})
    if result.status == 2:
        return {"status":"infeasible", "solver":__version__}
    if not result.success:
        return {"status":"failed", "solver":__version__}
    starts = {(i,k):t for x,(i,k,t) in zip(result.x, choices) if x>.5}
    if len(starts) != 6:
        raise ValueError("invalid solver vector")
    return {"status":"optimal", "solver":__version__,
            "starts":[starts[i,k] for k in ("I","R") for i in range(len(jobs))]}

if __name__ == "__main__":
    print(json.dumps(solve(json.loads(sys.argv[1]))))
