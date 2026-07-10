#!/usr/bin/env python3
"""Contract validator: schema validation + cross-file referential integrity.

Usage:  python3 validate.py            (run from shared/contracts/)
Checks the bundled examples; point it at real artifacts by editing INSTANCES.
Requires: pip install jsonschema
Exit code 0 = all good, 1 = violations (prints each).
"""
import json
import sys
from pathlib import Path

import jsonschema

HERE = Path(__file__).parent
INSTANCES = {
    "scenario": ("scenario-card.schema.json", "examples/scenario-card.example.json"),
    "transcript": ("transcript.schema.json", "examples/transcript.example.json"),
    "report": ("feedback-report.schema.json", "examples/feedback-report.example.json"),
}

errors = []
load = lambda p: json.load(open(HERE / p))

docs = {}
for name, (schema_path, instance_path) in INSTANCES.items():
    schema, instance = load(schema_path), load(instance_path)
    try:
        jsonschema.validate(instance, schema)
    except jsonschema.ValidationError as e:
        errors.append(f"{instance_path}: schema violation: {e.message}")
    docs[name] = instance

rubric, catalog = load("rubric.json"), load("indicator-catalog.json")
sc, tr, rep = docs["scenario"], docs["transcript"], docs["report"]

# Referential integrity
rubric_dims = {d["id"] for d in rubric["dimensions"]}
report_dims = {d["dimension_id"] for d in rep["dimensions"]}
if report_dims - rubric_dims:
    errors.append(f"report uses unknown dimension ids: {report_dims - rubric_dims}")
if rubric_dims - report_dims:
    errors.append(f"report missing rubric dimensions: {rubric_dims - report_dims}")
if rep["rubric_version"] != rubric["version"]:
    errors.append(f"rubric_version mismatch: report={rep['rubric_version']} rubric={rubric['version']}")

turn_ids = {t["turn_id"] for t in tr["turns"]}
for d in rep["dimensions"]:
    bad = set(d["anchors"]) - turn_ids
    if bad:
        errors.append(f"dimension {d['dimension_id']}: anchors not in transcript: {bad}")
for m in rep.get("modeled_alternatives", []):
    if m["turn_id"] not in turn_ids:
        errors.append(f"modeled_alternative references unknown turn: {m['turn_id']}")

indicator_ids = {i["id"] for i in catalog["indicators"]}
bad = set(sc["ground_truth"]["indicators_present"]) - indicator_ids
if bad:
    errors.append(f"scenario uses unknown indicator ids: {bad}")

# Every scenario-card*.json in examples/ must be schema-valid with known indicators
scenario_schema = load("scenario-card.schema.json")
card_paths = sorted((HERE / "examples").glob("scenario-card*.json"))
for card_path in card_paths:
    rel = card_path.relative_to(HERE)
    card = json.load(open(card_path))
    try:
        jsonschema.validate(card, scenario_schema)
    except jsonschema.ValidationError as e:
        errors.append(f"{rel}: schema violation: {e.message}")
        continue
    bad = set(card["ground_truth"]["indicators_present"]) - indicator_ids
    if bad:
        errors.append(f"{rel}: unknown indicator ids: {bad}")

# Session/scenario linkage
if tr["scenario_id"] != sc["scenario_id"]:
    errors.append("transcript.scenario_id does not match scenario card")
if rep["session_id"] != tr["session_id"] or rep["scenario_id"] != tr["scenario_id"]:
    errors.append("report session/scenario ids do not match transcript")

if errors:
    print("\n".join(f"FAIL: {e}" for e in errors))
    sys.exit(1)
print(f"OK: {len(INSTANCES)} instances valid; {len(card_paths)} scenario card(s) valid; cross-references consistent")
