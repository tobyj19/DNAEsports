"""Sanity-check freshly built site data files before an automated refresh publishes them.

Usage: python research/check-site-data.py NEW_FILE OLD_FILE [--min-ratio 0.95]

Compares how many cores have data per mode in the new file vs the one currently
on the site. Exits 1 (so the workflow fails and keeps the old data) if the new
file is unreadable or any mode lost more than (1 - min-ratio) of its cores — the
signature of an API hiccup or a crawl that died part-way. Works for
lib/data/breeder-scores.json (counts cores with an overall score) and
lib/data/distance-profiles.json (counts cores with a profile entry).
"""
import json, sys

MODES = ("bike", "car", "horse")


def counts(path):
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    cores = data["cores"]
    is_breeder = "grades" in data
    out = {}
    for m in MODES:
        out[m] = sum(1 for c in cores.values() if (("v" in c.get(m, {})) if is_breeder else (m in c)))
    return out


def main():
    args = sys.argv[1:]
    ratio = 0.95
    if "--min-ratio" in args:
        i = args.index("--min-ratio")
        ratio = float(args[i + 1])
        del args[i : i + 2]
    new_path, old_path = args
    try:
        new = counts(new_path)
    except Exception as e:  # noqa: BLE001
        print(f"FAIL {new_path}: can't read it ({e})")
        sys.exit(1)
    try:
        old = counts(old_path)
    except Exception:  # first run / no previous file: nothing to compare against
        print(f"OK {new_path}: {new} (no previous file to compare)")
        return
    bad = [m for m in MODES if old[m] and new[m] < ratio * old[m]]
    for m in MODES:
        print(f"{new_path} {m}: {old[m]} -> {new[m]}")
    if bad:
        print(f"FAIL {new_path}: too few cores in {', '.join(bad)} (need at least {ratio:.0%} of before) - keeping the old data")
        sys.exit(1)
    print(f"OK {new_path}")


if __name__ == "__main__":
    main()
