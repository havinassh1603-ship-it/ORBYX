"""
ORBYX end-to-end playtest (headless Chromium).

Drives the real game through its UI and keyboard: profile creation, menus, roster, briefing,
real WASD movement with wall collision, door opening, every workstation via the E key,
the Flight Director run, the cinematic, the debrief, history, persistence across reload,
profile export/import validation, and a second run that is designed to fail.

Usage: python3 tests/e2e/playtest.py [base_url] [out_dir]
"""
import json
import sys
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000/"
OUT = Path(sys.argv[2] if len(sys.argv) > 2 else "/home/ubuntu/orbyx-playtest")
OUT.mkdir(parents=True, exist_ok=True)

BEST = {"orbit": "sso600", "imager": "heron", "power": "balanced", "comms": "xhga", "launch": "kestrel"}
BAD = {"orbit": "sso800", "imager": "condor", "power": "heavy", "comms": "xmga", "launch": "kestrel"}

results: list[tuple[str, bool, str]] = []
console_errors: list[str] = []


def check(name: str, ok: bool, detail: str = ""):
    results.append((name, bool(ok), detail))
    print(("PASS " if ok else "FAIL ") + name + (f"  [{detail}]" if detail else ""), flush=True)


def shot(page, name):
    page.screenshot(path=str(OUT / f"{name}.png"))


JS_PLAYER = """() => { const s = window.__orbyx.game.scene.getScene('world'); return s && s.player ? {x: s.player.x, y: s.player.y} : null }"""
JS_TELEPORT = """([fx, fy]) => { const s = window.__orbyx.game.scene.getScene('world'); s.player.body.reset(fx, fy); }"""
JS_STATION_POINTS = """() => { const s = window.__orbyx.game.scene.getScene('world'); return s.interactables.map(i => ({t: i.target, fx: i.fx, fy: i.fy})) }"""
JS_SNAPSHOT = """() => { const a = window.__orbyx; return a.session ? {status: a.session.snapshot.status, decisions: a.session.snapshot.decisions, left: a.session.snapshot.timeLeftS} : null }"""


def hold(page, key, secs):
    page.keyboard.down(key)
    time.sleep(secs)
    page.keyboard.up(key)
    time.sleep(0.15)


def do_station(page, pt, option_id, tag=""):
    page.evaluate(JS_TELEPORT, [pt["fx"], pt["fy"] - 4])
    time.sleep(0.35)
    page.keyboard.press("e")
    page.wait_for_selector(".option", timeout=3000)
    if tag == "best":
        time.sleep(0.3)
        shot(page, f"best-station-{pt['t']['id']}")
    page.click(f".option[data-id='{option_id}']")
    page.keyboard.press("Enter")
    page.wait_for_selector(".option", state="detached", timeout=3000)
    time.sleep(0.2)


def fly(page, choices, tag):
    page.click("text=Play solo")
    page.wait_for_selector(".mission-card")
    page.click(".mission-card.playable >> text=Select crew")
    page.wait_for_selector(".roster-pick")
    page.click(".card-foot .btn.primary")  # continue as ...
    page.wait_for_selector("text=Begin mission")
    page.click("text=Begin mission")
    page.wait_for_function("() => window.__orbyx.game.scene.isActive('world')", timeout=8000)
    time.sleep(1.2)
    pts = page.evaluate(JS_STATION_POINTS)
    for p in pts:
        if p["t"]["kind"] == "station":
            do_station(page, p, choices[p["t"]["id"]], tag)
    snap = page.evaluate(JS_SNAPSHOT)
    check(f"[{tag}] all five workstations committed through E-key panels", snap and len(snap["decisions"]) == 5, json.dumps(snap["decisions"]) if snap else "no session")
    director = next(p for p in pts if p["t"]["kind"] == "director")
    page.evaluate(JS_TELEPORT, [director["fx"], director["fy"] - 4])
    time.sleep(0.35)
    page.keyboard.press("e")
    page.wait_for_selector("text=Design review", timeout=3000)
    shot(page, f"{tag}-08-director")
    page.click(".card-foot >> text=Run mission")
    page.wait_for_function("() => window.__orbyx.game.scene.isActive('cinematic')", timeout=5000)
    time.sleep(2.2)
    shot(page, f"{tag}-09-cinematic-a")
    time.sleep(2.6)
    shot(page, f"{tag}-10-cinematic-b")
    page.wait_for_selector(".debrief", timeout=20000)
    time.sleep(1.4)
    shot(page, f"{tag}-11-debrief")
    stamp = page.inner_text(".stamp").title()
    score = page.inner_text(".score-dial .val")
    return stamp, score


with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path="/usr/bin/chromium", args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"])
    ctx = browser.new_context(viewport={"width": 1440, "height": 860}, accept_downloads=True)
    page = ctx.new_page()
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: console_errors.append(f"pageerror: {e}"))

    page.goto(BASE)
    page.wait_for_selector(".profile-create", timeout=15000)
    time.sleep(0.8)
    shot(page, "01-profile-create")
    page.fill("input[type=text]", "x")
    page.click("text=Create profile")
    check("short name is rejected", page.is_visible("text=at least 2 characters"))
    page.fill("input[type=text]", "Ada Test")
    page.keyboard.press("Enter")
    page.wait_for_selector(".menu-main")
    time.sleep(1.0)
    shot(page, "02-main-menu")
    check("main menu shows player name", page.is_visible("text=Ada Test"))
    check("multiplayer is clearly marked as a later milestone", page.is_visible("text=Arrives in Milestone 4"))

    page.click("text=Play solo")
    page.wait_for_selector(".mission-card")
    time.sleep(0.4)
    shot(page, "03-mission-select")
    check("four missions listed", page.locator(".mission-card").count() == 4)
    check("only Earthwatch is playable", page.locator(".mission-card.playable").count() == 1)
    check("Lunar mission locked before Earthwatch is cleared", page.locator(".mission-card.locked").count() == 3)

    page.click(".mission-card.playable >> text=Select crew")
    page.wait_for_selector(".roster-pick")
    page.click(".roster-pick button[data-id='tereshkova']")
    time.sleep(0.6)
    shot(page, "04-roster-tereshkova")
    check("roster separates history from fictional role", page.is_visible("text=Historical record") and page.is_visible("text=ORBYX crew role - fictional"))
    page.click(".roster-pick button[data-id='armstrong']")
    page.click(".card-foot .btn.primary")
    page.wait_for_selector("text=Begin mission")
    shot(page, "05-briefing")
    page.click("text=Begin mission")
    page.wait_for_function("() => window.__orbyx.game.scene.isActive('world')", timeout=8000)
    time.sleep(1.5)
    shot(page, "06-world-spawn")

    # --- Doorway: start slightly off-centre, walk straight north, assist should guide through
    sp = page.evaluate(JS_PLAYER)
    page.evaluate(JS_TELEPORT, [sp["x"] + 40, sp["y"]])
    time.sleep(0.2)
    hold(page, "w", 2.6)
    p5 = page.evaluate(JS_PLAYER)
    shot(page, "07-walk-through-door")
    check("walking north passes through the automatic lobby door (with doorway assist)", p5["y"] < 15 * 48, f"y={p5['y']:.0f}px (door row at {15*48}px)")
    page.evaluate(JS_TELEPORT, [sp["x"], sp["y"]])
    time.sleep(0.2)

    # --- Real movement and collision
    p0 = page.evaluate(JS_PLAYER)
    hold(page, "d", 0.8)
    p1 = page.evaluate(JS_PLAYER)
    check("D moves the astronaut right", p1["x"] - p0["x"] > 60, f"dx={p1['x'] - p0['x']:.0f}px")
    hold(page, "ArrowLeft", 0.8)
    p2 = page.evaluate(JS_PLAYER)
    check("arrow keys also move", p1["x"] - p2["x"] > 60, f"dx={p1['x'] - p2['x']:.0f}px")
    hold(page, "s", 3.0)
    p3 = page.evaluate(JS_PLAYER)
    hold(page, "s", 1.0)
    p4 = page.evaluate(JS_PLAYER)
    check("wall collision stops the astronaut", abs(p4["y"] - p3["y"]) < 2, f"y {p3['y']:.0f} -> {p4['y']:.0f}")
    # HUD controls
    page.keyboard.press("m")
    page.wait_for_selector(".map-modal", timeout=2000)
    time.sleep(0.4)
    shot(page, "07b-map")
    page.keyboard.press("m")
    check("M toggles the map", not page.is_visible(".map-modal"))
    page.keyboard.press("h")
    page.wait_for_selector("text=How a mission works", timeout=2000)
    page.keyboard.press("Escape")
    check("H opens help, Esc closes it", not page.is_visible("text=How a mission works"))
    t_before = page.evaluate(JS_SNAPSHOT)["left"]
    page.keyboard.press("Escape")
    page.wait_for_selector("text=Mission paused")
    time.sleep(1.2)
    t_paused = page.evaluate(JS_SNAPSHOT)["left"]
    check("pause stops the countdown", abs(t_before - t_paused) < 0.2, f"{t_before:.2f} -> {t_paused:.2f}")
    page.keyboard.press("Escape")
    time.sleep(1.0)
    t_after = page.evaluate(JS_SNAPSHOT)["left"]
    check("resume restarts the countdown", t_paused - t_after > 0.5)

    # Director refuses before all stations are done
    pts = page.evaluate(JS_STATION_POINTS)
    director = next(p for p in pts if p["t"]["kind"] == "director")
    page.evaluate(JS_TELEPORT, [director["fx"], director["fy"] - 4])
    time.sleep(0.35)
    page.keyboard.press("e")
    page.wait_for_selector("text=Design review")
    check("Run Mission is disabled until every workstation is complete", page.locator(".card-foot >> text=Run mission").is_disabled())
    page.keyboard.press("Escape")

    # Abandon this attempt and fly the scripted best run
    page.keyboard.press("Escape")
    page.wait_for_selector("text=Mission paused")
    page.once("dialog", lambda d: d.accept())
    page.click("text=Abandon mission")
    page.wait_for_selector(".mission-card")
    page.click("text=Back")
    page.wait_for_selector(".menu-main")

    stamp, score = fly(page, BEST, "best")
    check("optimised design is Successful", "Successful" in stamp and "Partially" not in stamp, f"{stamp} {score}")
    check("debrief has subsystem review for all five decisions", page.locator(".subsys").count() == 5)

    page.click("text=Mission select")
    page.wait_for_selector(".mission-card")
    check("Lunar Survey is unlocked after a Successful Earthwatch", page.locator(".mission-card.locked").count() == 2)
    shot(page, "12-mission-select-after")
    page.click("text=Back")

    # Persistence
    page.reload()
    page.wait_for_selector(".menu-main", timeout=15000)
    check("profile persists across reload", page.is_visible("text=Ada Test"))
    page.click("text=Mission history")
    page.wait_for_selector(".history-row")
    check("history shows the saved report", page.locator(".history-row").count() == 1)
    shot(page, "13-history")
    page.click(".history-row")
    page.wait_for_selector(".debrief")
    page.click("text=Back to history")
    page.click(".card-head >> text=Back")

    # Export / import validation
    page.click("text=Settings")
    page.wait_for_selector("text=Export profile")
    shot(page, "14-settings")
    with page.expect_download() as dl:
        page.click("text=Export profile")
    exported = Path(dl.value.path()).read_text()
    data = json.loads(exported)
    check("export contains format, checksum and history", data.get("format") == "orbyx-profile" and len(data["profile"]["history"]) == 1)
    tampered = json.loads(exported)
    tampered["profile"]["displayName"] = "Hacker"
    bad = OUT / "tampered.json"
    bad.write_text(json.dumps(tampered))
    page.set_input_files(".modal input[type=file]", str(bad))
    time.sleep(0.6)
    check("tampered export is rejected by checksum", page.is_visible("text=checksum does not match"))
    page.keyboard.press("Escape")

    stamp2, score2 = fly(page, BAD, "bad")
    check("inadequate design fails", "Failed" in stamp2, f"{stamp2} {score2}")

    # Timer expiry with nothing submitted
    page.click("text=Main menu")
    page.wait_for_selector(".menu-main")
    page.click("text=Play solo")
    page.click(".mission-card.playable >> text=Select crew")
    page.click(".card-foot .btn.primary")
    page.click("text=Begin mission")
    page.wait_for_function("() => window.__orbyx.game.scene.isActive('world')", timeout=8000)
    time.sleep(0.8)
    page.evaluate("() => window.__orbyx.session.dispatch({type:'tick', dtS: 100000})")
    page.wait_for_selector(".debrief", timeout=25000)
    time.sleep(0.6)
    check("timer expiry with missing workstations fails the mission", "Failed" in page.inner_text(".stamp").title())
    shot(page, "15-timeout-debrief")

    browser.close()

real_errors = [e for e in console_errors if "favicon" not in e.lower()]
check("no console errors", not real_errors, "; ".join(real_errors[:5]))
passed = sum(1 for r in results if r[1])
print(f"\n{passed}/{len(results)} checks passed. Screenshots in {OUT}")
(OUT / "results.json").write_text(json.dumps([{"check": n, "pass": ok, "detail": d} for n, ok, d in results], indent=2))
sys.exit(0 if passed == len(results) else 1)
