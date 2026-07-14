'use strict';

// ---------------------------------------------------------------------------
// Content script — runs on Google Calendar day/week views.
//
// Owns every change to the page, so the popup only sends it messages. It also:
//   * persists the chosen mode to chrome.storage.local, and
//   * re-applies that mode automatically after a reload (F5), or when Google
//     re-renders the all-day strip, so the last choice "sticks".
//
// The two features are mutually exclusive (they both drive the all-day strip's
// height) but can both be off. Expand state lives on the strip's dataset; drag
// state lives on `window` alongside a teardown handle.
// ---------------------------------------------------------------------------
(function () {
    // Guard against running twice: the popup may inject this into an already-open
    // tab while it is also registered to auto-run on future loads.
    if (window.__calManipLoaded) return;
    window.__calManipLoaded = true;

    var STORAGE_KEY = 'calManipState';

    // Desired end-state we keep the page reconciled to. Mirrored in storage.
    // mode: 'expand' | 'drag' | null
    var desired = { mode: null, dragHeight: null };

    function onCalendar() {
        return location.href.toLowerCase()
            .startsWith('https://calendar.google.com/calendar/');
    }

    // The all-day strip is capped with an inline `max-height` in em units
    // (Google's default is "3em"). Detect it by that semantic style first, with
    // the current obfuscated class as a fallback.
    function findAllDayStrip() {
        var byStyle = [].slice.call(document.querySelectorAll('div[style*="max-height"]'))
            .find(function (el) {
                return /max-height:\s*[\d.]+em/i.test(el.getAttribute('style') || '');
            });
        return byStyle || document.querySelector('.Qotkjb');
    }

    // --- Expand feature ---
    function isExpanded(strip) {
        return strip.dataset.calManipApplied === 'true';
    }
    function setExpand(strip, on) {
        if (on) {
            if (isExpanded(strip)) return;
            strip.dataset.calManipMaxH = strip.style.maxHeight === '' ? '__empty__' : strip.style.maxHeight;
            strip.dataset.calManipOverflowY = strip.style.overflowY === '' ? '__empty__' : strip.style.overflowY;
            strip.style.maxHeight = 'none';
            strip.style.overflowY = 'visible';
            strip.dataset.calManipApplied = 'true';
        } else {
            if (!isExpanded(strip)) return;
            strip.style.maxHeight = strip.dataset.calManipMaxH === '__empty__' ? '' : strip.dataset.calManipMaxH;
            strip.style.overflowY = strip.dataset.calManipOverflowY === '__empty__' ? '' : strip.dataset.calManipOverflowY;
            delete strip.dataset.calManipApplied;
            delete strip.dataset.calManipMaxH;
            delete strip.dataset.calManipOverflowY;
        }
    }

    // --- Drag-handle feature ---
    function isDragOn() {
        return !!window.__calManipDrag;
    }
    function setDrag(strip, on, initialHeight) {
        if (on) {
            if (isDragOn()) return;

            var origMaxH = strip.style.maxHeight;
            var origHeight = strip.style.height;
            var origOverflowY = strip.style.overflowY;
            strip.style.overflowY = 'auto';

            // A parent otherwise caps the strip at roughly half the screen. Lift any
            // inline max-height on the ancestors (up to <body>) so the strip can grow
            // toward the 90% clamp below; restore them when the handle is removed.
            var liftedAncestors = [];
            for (var anc = strip.parentElement; anc && anc !== document.body; anc = anc.parentElement) {
                liftedAncestors.push({ el: anc, maxHeight: anc.style.maxHeight });
                anc.style.maxHeight = 'none';
            }

            var handle = document.createElement('div');
            handle.setAttribute('data-cal-manip-handle', 'true');
            handle.title = 'Drag to resize the all-day events area';
            Object.assign(handle.style, {
                position: 'fixed',
                zIndex: '2147483647',
                height: '10px',
                cursor: 'ns-resize',
                background: 'rgba(26,115,232,0.55)',
                borderTop: '1px solid rgba(26,115,232,0.9)',
                borderBottom: '1px solid rgba(26,115,232,0.9)',
                boxSizing: 'border-box',
                touchAction: 'none'
            });

            var grip = document.createElement('div');
            Object.assign(grip.style, {
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: 'translate(-50%,-50%)',
                width: '30px',
                height: '2px',
                background: '#fff',
                boxShadow: '0 3px 0 #fff, 0 -3px 0 #fff',
                pointerEvents: 'none'
            });
            handle.appendChild(grip);

            var reposition = function () {
                var r = strip.getBoundingClientRect();
                handle.style.left = r.left + 'px';
                handle.style.width = r.width + 'px';
                handle.style.top = (r.bottom - 5) + 'px';
            };

            // Drive `max-height` (not a fixed `height`): the pane grows to fit the
            // events but never taller than them, so the day-column separators always
            // reach the bottom of the pane instead of stopping at the last event with
            // dead space below. If the events exceed this height, overflow scrolls.
            var applyHeight = function (h) {
                var maxAllowed = window.innerHeight * 0.9; // don't let it eat the whole screen
                h = Math.min(maxAllowed, Math.max(0, h));
                strip.style.height = '';
                strip.style.maxHeight = h + 'px';
                reposition();
            };

            if (typeof initialHeight === 'number' && initialHeight > 0) {
                applyHeight(initialHeight);
            }

            var dragging = false;
            var onPointerDown = function (e) {
                dragging = true;
                try { handle.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
                e.preventDefault();
            };
            var onPointerMove = function (e) {
                if (!dragging) return;
                applyHeight(e.clientY - strip.getBoundingClientRect().top);
            };
            var onPointerUp = function (e) {
                if (!dragging) return;
                dragging = false;
                try { handle.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
                // Remember the size the user settled on, so a reload restores it.
                desired.dragHeight = parseFloat(strip.style.maxHeight) || strip.getBoundingClientRect().height;
                persist();
            };

            handle.addEventListener('pointerdown', onPointerDown);
            window.addEventListener('pointermove', onPointerMove);
            window.addEventListener('pointerup', onPointerUp);
            window.addEventListener('resize', reposition);
            window.addEventListener('scroll', reposition, true);

            document.body.appendChild(handle);
            reposition();
            strip.dataset.calManipDrag = 'true';

            window.__calManipDrag = {
                strip: strip,
                destroy: function () {
                    handle.removeEventListener('pointerdown', onPointerDown);
                    window.removeEventListener('pointermove', onPointerMove);
                    window.removeEventListener('pointerup', onPointerUp);
                    window.removeEventListener('resize', reposition);
                    window.removeEventListener('scroll', reposition, true);
                    handle.remove();
                    liftedAncestors.forEach(function (a) { a.el.style.maxHeight = a.maxHeight; });
                    strip.style.maxHeight = origMaxH;
                    strip.style.height = origHeight;
                    strip.style.overflowY = origOverflowY;
                    delete strip.dataset.calManipDrag;
                    delete window.__calManipDrag;
                }
            };
        } else {
            if (isDragOn()) window.__calManipDrag.destroy();
        }
    }

    // Google's own "Expand all-day section" chevron. While collapsed it renders a
    // "N more events" stub instead of the events, so our height change has nothing
    // to reveal. Click it open (only if currently collapsed). Returns true if it
    // clicked (the DOM was re-rendered).
    function ensureNativeExpanded() {
        var btn = document.querySelector('button[aria-label*="all-day section" i]');
        if (btn && btn.getAttribute('aria-expanded') === 'false') {
            btn.click();
            return true;
        }
        return false;
    }

    // --- State plumbing ---
    function currentState() {
        if (!onCalendar()) return { error: 'notcal', expand: false, drag: false };
        var strip = findAllDayStrip();
        if (!strip) return { error: 'missing', expand: false, drag: false };
        return { error: null, expand: isExpanded(strip), drag: isDragOn() };
    }

    function persist() {
        try {
            var out = {};
            out[STORAGE_KEY] = { mode: desired.mode, dragHeight: desired.dragHeight };
            chrome.storage.local.set(out);
        } catch (e) { /* storage unavailable — feature degrades to session-only */ }
    }

    // Make the page match `desired`. Idempotent, so it is safe to call on every
    // mutation. Handles Google replacing the strip element by rebuilding on the
    // new one.
    function reconcile() {
        if (!onCalendar() || desired.mode === null) return;
        var strip = findAllDayStrip();
        if (!strip) return;
        if (ensureNativeExpanded()) strip = findAllDayStrip() || strip;

        if (desired.mode === 'expand') {
            if (isDragOn()) setDrag(strip, false);
            if (!isExpanded(strip)) setExpand(strip, true);
        } else if (desired.mode === 'drag') {
            if (isExpanded(strip)) setExpand(strip, false);
            // (Re)build the handle if it's missing or was bound to a stale strip.
            if (!isDragOn() || window.__calManipDrag.strip !== strip) {
                if (isDragOn()) window.__calManipDrag.destroy();
                setDrag(strip, true, desired.dragHeight);
            }
        }
    }

    // --- Mutation observer, active only while a mode is set ---
    var observer = null;
    var pending = null;
    function onMutations() {
        if (pending) return;
        pending = setTimeout(function () { pending = null; reconcile(); }, 150);
    }
    function startObserver() {
        if (observer) return;
        observer = new MutationObserver(onMutations);
        observer.observe(document.documentElement, { childList: true, subtree: true });
    }
    function stopObserver() {
        if (!observer) return;
        observer.disconnect();
        observer = null;
        if (pending) { clearTimeout(pending); pending = null; }
    }

    function setMode(mode) {
        desired.mode = mode;
        if (mode !== 'drag') desired.dragHeight = null;
        persist();
        if (mode === null) stopObserver(); else startObserver();
    }

    // Toggle a feature on/off, enforcing mutual exclusion. Returns the new state.
    function toggle(action) {
        if (!onCalendar()) return { error: 'notcal', expand: false, drag: false };
        var strip = findAllDayStrip();
        if (!strip) return { error: 'missing', expand: false, drag: false };
        if (ensureNativeExpanded()) strip = findAllDayStrip() || strip;

        var mode;
        if (action === 'toggleExpand') mode = isExpanded(strip) ? null : 'expand';
        else mode = isDragOn() ? null : 'drag';

        setMode(mode);
        if (mode === null) {
            // reconcile() only enforces the active mode (to stay cheap), so an
            // explicit teardown is needed when switching everything off.
            setExpand(strip, false);
            setDrag(strip, false);
        } else {
            reconcile();
        }
        return currentState();
    }

    // --- Popup messaging ---
    chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
        if (!msg || !msg.action) return;
        if (msg.action === 'query') { sendResponse(currentState()); return; }
        if (msg.action === 'toggleExpand' || msg.action === 'toggleDrag') {
            sendResponse(toggle(msg.action));
            return;
        }
    });

    // --- Restore saved state on load ---
    function boot(state) {
        if (!state || !state.mode) return;
        desired.mode = state.mode;
        desired.dragHeight = typeof state.dragHeight === 'number' ? state.dragHeight : null;
        startObserver();
        // The strip loads asynchronously after document_idle, so retry a few
        // times; the observer then keeps it applied across later re-renders.
        reconcile();
        [300, 800, 1600, 3000].forEach(function (t) { setTimeout(reconcile, t); });
    }
    try {
        chrome.storage.local.get(STORAGE_KEY, function (data) {
            boot(data && data[STORAGE_KEY]);
        });
    } catch (e) { /* storage unavailable */ }
})();
