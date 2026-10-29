# EmbodiedSafetyBench website

Static multi-page site, no build step: `index.html` (overview), `leaderboard/`, `tasks/` (filters over the task
taxonomy; `tasks/?task=<task id>` opens the card of one task), `demos/` (every recorded episode), `run/?r=<episode>`
(one episode step by step) and `method/`. The navigation, footer, video player and task card come from `app.js`; each
page sets `data-page` and `data-root`.

Everything shown comes from data files, so updates are file replacements:

- `data/results.json`: leaderboard. `ranking` holds the headline rate of each level (higher is better), `levels` the
  fine-grained results.
- `data/tasks.json` + `assets/thumbs/*.jpg`: tasks with their taxonomy tags, written by `export_tasks.py`;
  `add_positions.py` then places each task on the task overview figure.
- `data/runs.json`, `data/views.json` + `assets/runs/{videos,posters,traj,cams}`: every recorded episode (the unedited
  overview video written by `msb.tools.run_program --video`), its outcome and trajectory, and the initial camera views
  of each task, written by `export_runs.py`.

Both export scripts read `MSB_DATA`, `SITE_OUT`, `MSB_EVAL_LAYOUTS` and `MSB_TASK_LIST`. After replacing data, run
`python build_data_js.py`: it wraps every data file in a small script so the pages also work from a static host, and
stamps a version on `app.js` and `style.css`.

Preview locally:

    cd website && python serve.py

To publish with GitHub Pages, serve this folder (for example from a `gh-pages` branch or a Pages workflow).
