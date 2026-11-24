"""External trusted numerical tool; no DomainHarness runtime in Python."""
import json
import sys
import numpy as np
import scipy
from scipy.optimize import Bounds, LinearConstraint, milp

model = json.loads(sys.argv[1])
tasks, horizon, closed = model['tasks'], model['horizon'], model['closed']
choices = [(t['id'], s) for t in tasks for s in range(horizon-t['duration']+1)
           if all(k not in closed.get(t['machine'], []) for k in range(s, s+t['duration']))]
if any(not any(i == t['id'] for i, _ in choices) for t in tasks):
    print(json.dumps({'status': 'INFEASIBLE', 'solver': scipy.__version__})); sys.exit(0)
size = len(choices)+1
rows, lo, hi = [], [], []
def row(coeff, lower, upper):
    rows.append(coeff); lo.append(lower); hi.append(upper)
def coeff(fn, last=0):
    return [fn(i,s) for i,s in choices]+[last]
for t in tasks:
    i, d = t['id'], t['duration']
    row(coeff(lambda j,s: int(j==i)), 1, 1)
    row(coeff(lambda j,s: s+d if j==i else 0, -1), -np.inf, 0)
    for pred in t['after']:
        dp = next(q['duration'] for q in tasks if q['id']==pred)
        row(coeff(lambda j,s: s+dp if j==pred else -s if j==i else 0), -np.inf, 0)
for machine in sorted({t['machine'] for t in tasks}):
    durations = {t['id']:t['duration'] for t in tasks if t['machine']==machine}
    for k in range(horizon):
        row(coeff(lambda i,s: int(i in durations and s<=k<s+durations.get(i,0))), 0, 1)
objective = np.zeros(size); objective[-1]=1
result=milp(objective, integrality=np.ones(size), bounds=Bounds(np.zeros(size),np.array([1]*(size-1)+[horizon])), constraints=LinearConstraint(np.asarray(rows),lo,hi),options={'time_limit':5.0,'mip_rel_gap':0.0})
if result.status == 0 and result.x is not None:
    starts={i:s for (i,s),x in zip(choices,result.x[:-1]) if x>0.5}
    print(json.dumps({'status':'OPTIMAL','starts':starts,'makespan':round(result.fun),'solver':scipy.__version__}))
else:
    print(json.dumps({'status':'INFEASIBLE' if result.status==2 else 'UNKNOWN','solver':scipy.__version__}))
