"""Wrap every data file of the site in a small script (data/*.json and assets/runs/traj/*.json -> .js next to them),
so the pages load their data with <script> tags. That works from http:// and from a plain file:// open alike, which
fetch() does not. Also stamps a new version on app.js and style.css in every page, so browsers drop old copies.

Run after replacing any data file:  python build_data_js.py
"""
import glob
import json
import os
import re
import time

ROOT = os.path.dirname(os.path.abspath(__file__))
os.chdir(ROOT)
files = glob.glob("data/*.json") + glob.glob("assets/runs/traj/*.json")
for f in files:
    key = f.replace(os.sep, "/")
    data = json.load(open(f, encoding="utf-8"))
    with open(f[:-5] + ".js", "w", encoding="utf-8") as out:
        out.write("(window.__msb = window.__msb || {})[" + json.dumps(key) + "] = ")
        json.dump(data, out, ensure_ascii=False, separators=(",", ":"))
        out.write(";\n")
version = str(int(time.time()))
open("data/version.js", "w", encoding="utf-8").write(f'window.__msbVersion = "{version}";\n')
for page in glob.glob("**/*.html", recursive=True):
    s = open(page, encoding="utf-8").read()
    s2 = re.sub(r'(app\.js|style\.css)(\?v=\d+)?"', lambda m: f'{m.group(1)}?v={version}"', s)
    if s2 != s:
        open(page, "w", encoding="utf-8").write(s2)
print(len(files), "data files wrapped, version", version)
