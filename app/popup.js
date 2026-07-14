'use strict';

// The popup is a thin remote control: all page manipulation and persistence
// lives in the content script (app/content.js), which Chrome injects on every
// Google Calendar page. The popup just messages the active tab and reflects
// whatever state it reports back.

async function send(action) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) return { error: 'notcal', expand: false, drag: false };
    try {
        const res = await chrome.tabs.sendMessage(tab.id, { action });
        return res || { error: 'notcal', expand: false, drag: false };
    } catch (e) {
        // No content script in this tab → not a Google Calendar page, or the tab
        // was already open when the extension was installed and needs a refresh.
        return { error: 'notcal', expand: false, drag: false };
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const status = document.getElementById('status');
    const expandBtn = document.getElementById('btnRemoveHoursPart');
    const dragBtn = document.getElementById('btnDragHandle');
    const expandLabel = document.getElementById('btnLabel');
    const dragLabel = document.getElementById('dragLabel');

    // The buttons are toggles: aria-pressed drives the "on" styling, and the
    // labels flip to match. They are mutually exclusive but can both be off.
    function syncToggle(state) {
        const on = { expand: !!state.expand, drag: !!state.drag };
        expandBtn.setAttribute('aria-pressed', on.expand ? 'true' : 'false');
        dragBtn.setAttribute('aria-pressed', on.drag ? 'true' : 'false');
        expandLabel.textContent = on.expand ? 'All-day area expanded' : 'Expand all-day area';
        dragLabel.textContent = on.drag ? 'Drag handle enabled' : 'Enable drag handle';
    }

    function reportError(state) {
        if (state.error === 'missing') {
            status.textContent = "Couldn't find the all-day strip — Google may have changed its layout.";
        } else if (state.error === 'notcal') {
            status.textContent = 'Open a Google Calendar day/week view, then reload the tab.';
        }
        return !!state.error;
    }

    // Reflect the page's current state when the popup opens.
    send('query').then((state) => {
        syncToggle(state);
        if (state.error === 'notcal') {
            status.textContent = 'Open this on a Google Calendar day/week view to use these.';
        }
    });

    expandBtn.addEventListener('click', async () => {
        status.textContent = '';
        const state = await send('toggleExpand');
        syncToggle(state);
        if (reportError(state)) return;
        status.textContent = state.expand
            ? 'All-day area expanded — it will re-apply after reloads.'
            : 'Layout restored.';
    });

    dragBtn.addEventListener('click', async () => {
        status.textContent = '';
        const state = await send('toggleDrag');
        syncToggle(state);
        if (reportError(state)) return;
        status.textContent = state.drag
            ? 'Drag the blue grip on the border to resize.'
            : 'Drag handle removed.';
    });
});
