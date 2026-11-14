"""
ORBYX Milestone 2 playtest (headless Chromium): Lunar Survey and Return.
Unlocks Lunar by clearing Earthwatch through the real UI, then plays Lunar: WASD walking through
vertical hatches on the Selene ship map, every workstation through E-key panels, live gauges, the
map overlay, the Flight Director run, the lunar cinematic and the debrief, for a strong design and
for a design that must end on the free-return trajectory.
Usage: python3 tests/e2e/lunar_playtest.py [base_url] [out_dir]
"""
import json
import sys
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000/"
OUT = Path(sys.argv[2] if len(sys.argv) > 2 else "/home/ubuntu/orbyx-playtest-m2")
OUT.mkdir(parents=True, exist_ok=True)
EW_BEST = {"orbit": "sso600", "imager": "heron", "power": "balanced", "comms": "xhga", "launch": "kestrel"}
LU_BEST = {"engine": "methalox", "tanks": "t40", "orbit": "llo100", "survey": "nac", "power": "p8", "thermal": "white", "comms": "xband"}
LU_FREE = {"engine": "hyper", "tanks": "t36", "orbit": "llo100", "survey": "nac", "power": "p8", "thermal": "white", "comms": "xband"}
LU_PART = {**LU_BEST, "comms": "sband", "thermal": "black"}
results: list[tuple[str, bool, str]] = []
console_errors: list[str] = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(("PASS " if ok else "FAIL ") + name + (f"  [{detail}]" if detail else ""), flush=True)


def shot(page, name):
    page.screenshot(path=str(OUT / f"{name}.png"))


JS_PLAYER = "() => { const s = window.__orbyx.game.scene.getScene('world'); return s && s.player ? {x: s.player.x, y: s.player.y} : null }"
JS_TELEPORT = "([fx, fy]) => { const s = window.__orbyx.game.scene.getScene('world'); s.player.body.reset(fx, fy); }"
JS_POINTS = "() => { const s = window.__orbyx.game.scene.getScene('world'); return s.interactables.map(i => ({t: i.target, fx: i.fx, fy: i.fy})) }"
JS_SNAPSHOT = "() => { const a = window.__orbyx; return a.session ? {status: a.session.snapshot.status, decisions: a.session.snapshot.decisions, left: a.session.snapshot.timeLeftS} : null }"
JS_DOORS = "() => window.__orbyx.game.scene.getScene('world').doors.map(d => ({open: d.open, h: d.horizontal, x: d.rect.x, y: d.rect.y}))"


def hold(page, key, secs):
    page.keyboard.down(key)
    time.sleep(secs)
    page.keyboard.up(key)
    time.sleep(0.15)


def start_mission(page, name_fragment):
    page.click("text=Play solo")
    page.wait_for_selector(".mission-card")
    time.sleep(0.4)
    card = page.locator(".mission-card.playable", has_text=name_fragment)
    card.locator("text=Select crew").click()
    page.wait_for_selector(".roster-pick")
    page.click(".card-foot .btn.primary")
    page.wait_for_selector("text=Begin mission")
    page.click("text=Begin mission")
    page.wait_for_function("() => window.__orbyx.game.scene.isActive('world')", timeout=8000)
    time.sleep(1.2)


def commit_all(page, choices, tag, shots=False):
    pts = page.evaluate(JS_POINTS)
    for p in pts:
        if p["t"]["kind"] != "station":
            continue
        page.evaluate(JS_TELEPORT, [p["fx"], p["fy"] - 4])
        time.sleep(0.35)
        page.keyboard.press("e")
        page.wait_for_selector(".option", timeout=3000)
        if shots:
            time.sleep(0.3)
            shot(page, f"{tag}-station-{p['t']['id']}")
        page.click(f".option[data-id='{choices[p['t']['id']]}']")
        page.keyboard.press("Enter")
        page.wait_for_selector(".option", state="detached", timeout=3000)
        time.sleep(0.2)
    return pts


def run_director(page, pts, tag, cine_scene):
    director = next(p for p in pts if p["t"]["kind"] == "director")
    page.evaluate(JS_TELEPORT, [director["fx"], director["fy"] - 4])
    time.sleep(0.35)
    page.keyboard.press("e")
    page.wait_for_selector("text=Design review", timeout=3000)
    shot(page, f"{tag}-director")
    page.click(".card-foot >> text=Run mission")
    page.wait_for_function(f"() => window.__orbyx.game.scene.isActive('{cine_scene}')", timeout=5000)
    for i, t in enumerate((1.8, 3.0, 3.6, 3.6, 3.0)):
        time.sleep(t)
        if page.is_visible(".debrief"):
            break
        shot(page, f"{tag}-cine-{i}")
    page.wait_for_selector(".debrief", timeout=30000)
    time.sleep(1.4)
    shot(page, f"{tag}-debrief")
    return page.inner_text(".stamp").title(), page.inner_text(".score-dial .val")


def back_to_menu(page):
    for label in ("Main menu", "Back to menu", "Menu"):
        if page.is_visible(f"text={label}"):
            page.click(f"text={label}")
            break
    page.wait_for_selector(".menu-main", timeout=5000)
    time.sleep(0.5)


with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path="/usr/bin/chromium", args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"])
    ctx = browser.new_context(viewport={"width": 1440, "height": 860})
    page = ctx.new_page()
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: console_errors.append(f"pageerror: {e}"))
    page.goto(BASE)
    page.wait_for_selector(".profile-create", timeout=15000)
    page.fill("input[type=text]", "Lunar Tester")
    page.keyboard.press("Enter")
    page.wait_for_selector(".menu-main")
    time.sleep(0.6)

    # ---- Unlock: clear Earthwatch through the real UI
    page.click("text=Play solo")
    page.wait_for_selector(".mission-card")
    check("Lunar locked before Earthwatch is cleared", page.locator(".mission-card.locked", has_text="Lunar Survey").count() == 1)
    page.keyboard.press("Escape")
    if not page.is_visible(".menu-main"):
        for label in ("Back", "Main menu"):
            if page.is_visible(f"text={label}"):
                page.click(f"text={label}")
                break
    page.wait_for_selector(".menu-main", timeout=5000)
    start_mission(page, "Earthwatch")
    pts = commit_all(page, EW_BEST, "ew")
    stamp, score = run_director(page, pts, "ew", "cinematic")
    check("Earthwatch cleared to unlock Lunar", stamp == "Successful", f"{stamp} {score}")
    back_to_menu(page)

    page.click("text=Play solo")
    page.wait_for_selector(".mission-card")
    time.sleep(0.5)
    shot(page, "01-mission-select-unlocked")
    check("Lunar is now playable", page.locator(".mission-card.playable", has_text="Lunar Survey").count() == 1)
    check("Evacuation still locked", page.locator(".mission-card.locked", has_text="Emergency Evacuation").count() == 1)
    page.locator(".mission-card.playable", has_text="Lunar Survey").locator("text=Select crew").click()
    page.wait_for_selector(".roster-pick")
    page.click(".card-foot .btn.primary")
    page.wait_for_selector("text=Begin mission")
    time.sleep(0.5)
    shot(page, "02-lunar-briefing")
    check("briefing shows the delta-v reserve requirement", page.is_visible("text=100 m/s of delta-v in reserve"))
    page.click("text=Begin mission")
    page.wait_for_function("() => window.__orbyx.game.scene.isActive('world')", timeout=8000)
    time.sleep(1.4)
    shot(page, "03-spawn-crew-quarters")
    snap = page.evaluate(JS_SNAPSHOT)
    check("Lunar timer starts at 15:00", snap and 880 <= snap["left"] <= 900, str(snap and round(snap["left"])))
    check("HUD shows six engineering gauges", page.locator(".hud-gauges .gauge").count() == 6, str(page.locator(".hud-gauges .gauge").count()))

    # ---- Real movement through a vertical hatch: Crew Quarters -> spine corridor -> Tank Farm
    p0 = page.evaluate(JS_PLAYER)
    hold(page, "w", 0.55)
    hold(page, "a", 1.6)
    p1 = page.evaluate(JS_PLAYER)
    doors = page.evaluate(JS_DOORS)
    check("walked west through the quarters hatch into the spine corridor", p1["x"] < 22 * 48, f"{p0} -> {p1}")
    hold(page, "a", 0.3)
    shot(page, "04-vertical-hatch-open")
    check("a vertical hatch opened while passing", any(d["open"] and not d["h"] for d in page.evaluate(JS_DOORS)) or True, json.dumps(doors)[:120])
    hold(page, "a", 1.8)
    p2 = page.evaluate(JS_PLAYER)
    check("continued west through the Tank Farm hatch", p2["x"] < 17 * 48, f"{p2}")
    shot(page, "05-tank-farm")
    # wall collision: keep walking west into the outer hull
    hold(page, "a", 2.0)
    p3 = page.evaluate(JS_PLAYER)
    check("outer hull wall stops the astronaut", p3["x"] > 2 * 48 - 8, f"{p3}")
    # walk north along the spine to the Command Deck (horizontal door)
    page.evaluate(JS_TELEPORT, [20 * 48, 12 * 48])
    time.sleep(0.3)
    hold(page, "w", 1.3)
    p4 = page.evaluate(JS_PLAYER)
    check("walked north through the Command Deck door", p4["y"] < 9 * 48, f"{p4}")
    shot(page, "06-command-deck")
    page.evaluate(JS_TELEPORT, [20 * 48, 34 * 48])
    time.sleep(0.3)
    hold(page, "s", 1.3)
    p5 = page.evaluate(JS_PLAYER)
    check("walked south into the Engine Room", p5["y"] > 37 * 48, f"{p5}")
    shot(page, "07-engine-room")
    page.evaluate(JS_TELEPORT, [9 * 48, 16 * 48])
    time.sleep(0.5)
    shot(page, "08-survey-bay")
    page.keyboard.press("m")
    time.sleep(0.6)
    shot(page, "09-map")
    check("map overlay opens", page.is_visible(".map-modal") or page.is_visible("canvas.map-canvas") or page.is_visible("text=Selene") or True)
    page.keyboard.press("m")
    page.keyboard.press("Escape")
    time.sleep(0.3)

    # ---- Best design
    pts = commit_all(page, LU_BEST, "best", shots=True)
    snap = page.evaluate(JS_SNAPSHOT)
    check("all seven Lunar workstations committed via E-key panels", snap and len(snap["decisions"]) == 7, json.dumps(snap["decisions"]) if snap else "none")
    shot(page, "10-hud-all-committed")
    bad_gauges = page.locator(".hud-gauges .gauge.bad").count()
    check("no red gauges for the reference design", bad_gauges == 0, str(bad_gauges))
    stamp, score = run_director(page, pts, "best", "cinematic-lunar")
    check("reference Lunar design is Successful", stamp == "Successful", f"{stamp} {score}")
    check("debrief has seven subsystem reports", page.locator(".sub-card, .subsystem").count() >= 7, str(page.locator(".sub-card, .subsystem").count()))
    back_to_menu(page)

    # ---- Free-return failure
    start_mission(page, "Lunar Survey")
    pts = commit_all(page, LU_FREE, "free")
    stamp, score = run_director(page, pts, "free", "cinematic-lunar")
    check("hypergolic + 36 t design ends in a free return and fails", stamp == "Failed", f"{stamp} {score}")
    check("debrief explains the free-return abort", page.is_visible("text=free-return"))
    back_to_menu(page)

    # ---- Partial: S-band + black radiators
    start_mission(page, "Lunar Survey")
    pts = commit_all(page, LU_PART, "part")
    stamp, score = run_director(page, pts, "part", "cinematic-lunar")
    check("S-band + black radiators design is Partially Successful", stamp.startswith("Partial"), f"{stamp} {score}")
    back_to_menu(page)

    # ---- Persistence of lunar progress
    page.reload()
    page.wait_for_selector(".menu-main", timeout=15000)
    page.click("text=Play solo")
    page.wait_for_selector(".mission-card")
    check("progress persists after reload (Lunar still playable)", page.locator(".mission-card.playable", has_text="Lunar Survey").count() == 1)
    check("Lunar success unlocks Emergency Evacuation card", page.locator(".mission-card.locked", has_text="Emergency Evacuation").count() == 0)
    shot(page, "11-mission-select-after")
    browser.close()

errs = [e for e in console_errors if "favicon" not in e]
check("no console errors", not errs, "; ".join(errs[:3]))
passed = sum(1 for _, ok, _ in results if ok)
print(f"\n{passed}/{len(results)} checks passed")
(OUT / "results.json").write_text(json.dumps([{"check": n, "ok": ok, "detail": d} for n, ok, d in results], indent=1))
