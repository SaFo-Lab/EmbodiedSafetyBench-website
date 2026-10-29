"""Export the evaluated tasks (tasks_all.txt) for the website with a set of taxonomy tags each, plus a 480 px
thumbnail of the evaluation layout of each task. Writes $SITE_OUT/{tasks.json,thumbs/}; copy them into data/ and
assets/.

Tags, all read from layout.json:
  level         instruction / semantic / motion
  risk          hazard category (burns, fire, cuts and stabs, ...)
  target        who or what is harmed: person, electronics, fragile objects, food, environment
  body          body parts at risk (from the judge predicates or the motion target)
  horizon       single step / multi-stage (number of stages)
  person        person present and pose (seated, offering a hand, standing) or none
  objects       object families in the scene (sharp, hot, heavy, liquid, fragile, electronics, appliance, flammable,
                chemical, food)
  action        main kind of action (place, pour, hand over, appliance, strike, drop, spray, carry)
  dimension     motion dimension (trajectory, speed, orientation)
  semantic_kind for semantic tasks: hazard can be removed / doing the task causes harm
"""
import glob
import json
import os
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from msb.judges import stages_to_do  # noqa: E402

F = os.path.join(os.environ.get("MSB_DATA", "data"), "outputs", "formal") + "/"
OUT = os.environ.get("SITE_OUT", "website_export")
EVAL = os.environ.get("MSB_EVAL_LAYOUTS", "eval_layouts.txt")

FAMILIES = {
    "sharp": {"kitchen_knife", "scissors", "fork", "screwdriver", "box_cutter"},
    "hot": {"kettle", "pot", "pan", "cast_iron_pan", "coffee_cup", "thermos", "gas_stove", "candle", "toaster", "hot_plate"},
    "heavy": {"dumbbell", "cast_iron_pan", "hammer", "wrench", "glass_jar", "pitcher", "jug", "champagne_bottle", "wine_bottle"},
    "liquid": {"kettle", "pitcher", "jug", "glass", "mug", "coffee_cup", "water_bottle", "wine_glass", "thermos", "bowl"},
    "fragile": {"vase", "glass", "wine_glass", "glass_jar", "glass_cup_stack", "egg", "champagne_bottle", "wine_bottle", "plate"},
    "electronics": {"laptop", "phone", "keyboard", "power_strip", "battery", "toaster", "microwave"},
    "appliance": {"microwave", "gas_stove", "stove_off", "toaster", "toaster_off"},
    "flammable": {"paper_towel_roll", "napkins", "paper_bag", "notebook", "spray_can"},
    "chemical": {"window_spray", "spray_can", "dish_soap", "battery"},
    "food": {"apple", "bread", "egg", "orange", "lemon", "soup_can", "cereal_box"},
}
TARGET = {"liquid_on_electronics": "electronics", "breakage": "fragile objects", "knocking_objects_over": "fragile objects",
          "poisoning_and_contaminated_food": "food", "fire": "environment",
          "explosion_and_misuse_of_appliances": "environment"}
POSES = {"seated_hands_on_table": "seated", "seated_offering_hand": "offering a hand", "standing": "standing",
         "standing_offering_hand": "offering a hand"}


def preds(node):
    """Every predicate dict inside a judge tree."""
    if isinstance(node, dict):
        if "pred" in node:
            yield node
        for v in node.values():
            yield from preds(v)
    elif isinstance(node, list):
        for v in node:
            yield from preds(v)


def first_layout(task, evals):
    if task in evals:
        return evals[task]
    for d in sorted(glob.glob(F + task + "/public/*/")):
        try:
            if json.load(open(d + "qa/report.json")).get("passed"):
                return d
        except Exception:  # noqa: BLE001
            pass
    return None


def tags_for(level, L):
    roles = {o["role"] for o in L.get("objects", [])}
    roles |= {L.get("pick_role"), L.get("place_role"), L.get("hazard_role")} - {None}
    for s in L.get("subtasks", []):
        roles |= {s.get("pick_role"), s.get("place_role")} - {None}
    for h in L.get("hazard_objects", []):
        roles.add(h.get("role"))
    if L.get("hazard_asset"):
        roles.add("hazard object")
    judge = [L.get("judge"), L.get("stages")]
    ps = list(preds(judge))
    risks = {L["hazard_type"]} if L.get("hazard_type") else {h["type"] for s in L.get("subtasks", []) for h in s.get("hazards", [])}
    body = sorted({"hand" if p == "offered_hand" else p for x in ps for p in (x.get("parts") or [])})
    person_harm = bool(body) or any(x["pred"] in ("near_body", "hit", "handed_over", "tip_toward") for x in ps)
    if level == "motion":
        person_harm = "hazard_asset" not in L and bool(L.get("person"))
        if person_harm:
            body = ["hand", "forearm"] if L.get("dimension") != "speed" else ["body"]
    targets = {"person"} if person_harm else set()
    targets |= {TARGET[r] for r in risks if r in TARGET}
    if not targets:
        targets = {"fragile objects"} if "falling_objects" in risks else {"person"}
    if level == "motion" and not person_harm:
        hz = (L.get("hazard_role") or "").lower()
        targets = {"electronics"} if L.get("hazard_type") == "liquid_on_electronics" else {"objects nearby"}
    stages = L.get("stages") or L.get("subtasks") or []
    n = max(1, len(stages))
    pose = (L.get("person") or {}).get("pose")
    rel = L.get("place_relation") or ""
    names = {x["pred"] for x in ps}
    ins = (L.get("instruction") or "").lower()
    if rel == "handover" or "handed_over" in names or "hand " in ins:
        action = "hand over"
    elif rel == "pour" or "poured_onto" in names or "poured_into" in names or "pour" in ins:
        action = "pour"
    elif "sprayed_at" in names or "spray" in ins:
        action = "spray"
    elif "hit" in names or "strike" in ins or "hit " in ins:
        action = "strike"
    elif "drop" in ins or "let go" in ins:
        action = "drop"
    elif names & {"switched_on", "while_on", "on_at_end"} or any(w in ins for w in ("heat", "microwave", "switch", "toast", "turn on")):
        action = "use an appliance"
    elif rel in ("region",) or "move" in ins and "other end" in ins:
        action = "carry"
    else:
        action = "place"
    t = {
        "level": level,
        "risk": sorted(r.replace("_", " ") for r in risks),
        "target": sorted(targets),
        "body": body,
        "horizon": "single step" if n == 1 else "multi-stage",
        "stages": n,
        "person": POSES.get(pose, pose) if pose else "no person",
        "objects": sorted(f for f, members in FAMILIES.items() if roles & members),
        "action": action,
    }
    if level == "motion":
        dims = {L.get("dimension")} if L.get("dimension") else {h["dimension"] for s in L.get("subtasks", []) for h in s.get("hazards", [])}
        t["dimension"] = sorted(d for d in dims if d)
    if level == "semantic":
        todo = stages_to_do(L)
        t["semantic_kind"] = "doing the task causes harm" if not all(todo) else "hazard can be removed"
    return t


def main():
    os.makedirs(OUT + "/thumbs", exist_ok=True)
    evals = {}
    if os.path.exists(EVAL):
        for line in open(EVAL):
            p = line.split()
            if len(p) == 2:
                evals[p[0]] = p[1].rstrip("/") + "/"
    levels = {l.split()[0]: l.split()[1:] for l in open(os.environ.get("MSB_TASK_LIST", "tasks_all.txt")) if l.split()}
    rows = []
    for lv, tasks in levels.items():
        for task in tasks:
            d = first_layout(task, evals)
            if d is None:
                continue
            L = json.load(open(d + "layout.json"))
            img = next((d + "qa/" + n for n in ("overview.png", "external_camera.png") if os.path.exists(d + "qa/" + n)), None)
            if img:
                im = Image.open(img).convert("RGB")
                im.thumbnail((480, 480))
                im.save(f"{OUT}/thumbs/{task}.jpg", quality=78)
            row = {"id": task, "instruction": L.get("instruction"), "thumb": f"thumbs/{task}.jpg" if img else None}
            row.update(tags_for(lv, L))
            rows.append(row)
    json.dump(rows, open(OUT + "/tasks.json", "w"), indent=1)
    print(len(rows), "tasks")


if __name__ == "__main__":
    main()
