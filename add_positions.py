"""Place every task on a sphere for the home page, so that similar tasks lie close together: each task is a vector of
its taxonomy tags and instruction words, reduced to three dimensions (PCA), put on the unit sphere and spread a
little so that no two dots coincide. Writes x, y, z into data/tasks.json.

Run after export_tasks.py:  python add_positions.py
"""
import json
import math
import os
import re

import numpy as np

ROOT = os.path.dirname(os.path.abspath(__file__))
PATH = os.path.join(ROOT, "data", "tasks.json")
TAGS = ("level", "semantic_kind", "risk", "target", "person", "body", "dimension", "action", "objects", "horizon")
WEIGHT = {"level": 1.5, "risk": 2.0, "dimension": 1.5, "target": 1.5}
STOP = set("the a an to of on in into onto with and then it its is at from by for".split())

tasks = json.load(open(PATH, encoding="utf-8"))
feats = {}
rows = []
for t in tasks:
    f = {}
    for k in TAGS:
        v = t.get(k)
        for x in (v if isinstance(v, list) else [v] if v is not None else []):
            f[f"{k}={x}"] = WEIGHT.get(k, 1.0)
    for w in re.findall(r"[a-z]+", (t.get("instruction") or "").lower()):
        if w not in STOP and len(w) > 2:
            f["w=" + w] = 0.6
    rows.append(f)
    for k in f:
        feats.setdefault(k, len(feats))
X = np.zeros((len(tasks), len(feats)))
for i, f in enumerate(rows):
    for k, w in f.items():
        X[i, feats[k]] = w
X -= X.mean(0)
_, _, vt = np.linalg.svd(X, full_matrices=False)
P = X @ vt[:3].T
P /= np.linalg.norm(P, axis=1, keepdims=True) + 1e-9
# Spread: a few rounds of repulsion between dots closer than a minimum angle, staying on the sphere.
rng = np.random.default_rng(0)
P += rng.normal(0, 0.02, P.shape)
P /= np.linalg.norm(P, axis=1, keepdims=True)
MIN = math.radians(14)
for _ in range(400):
    d = P[:, None, :] - P[None, :, :]
    dist = np.linalg.norm(d, axis=2) + np.eye(len(P))
    push = np.where(dist < 2 * math.sin(MIN / 2), (2 * math.sin(MIN / 2) - dist) / dist, 0.0)
    P += 0.3 * (d * push[:, :, None]).sum(1)
    P /= np.linalg.norm(P, axis=1, keepdims=True)
for t, p in zip(tasks, P):
    t["x"], t["y"], t["z"] = (round(float(v), 4) for v in p)
json.dump(tasks, open(PATH, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
print(len(tasks), "tasks placed on the sphere")
