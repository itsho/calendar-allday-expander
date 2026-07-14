# Google Calendar All-Day Expander

A Chrome extension that fixes Google Calendar's day/week views clipping extra all-day events behind the hourly grid.

## The problem

In Google Calendar's day and week views, the **all-day events** strip at the top has a fixed maximum height. When several all-day events land on the same day, the extras are clipped and hidden behind the hourly grid below.

## What it does

From the toolbar popup you get two mutually exclusive toggles:

- **Expand all-day area** - removes the height cap so every all-day event is shown at once.
- **Enable drag handle** - adds a draggable grip on the border between the all-day strip and the hourly grid, so you can resize it to whatever height you want.

Turning one on turns the other off, and each button toggles back off on a second click. The change is purely visual - it only adjusts the height of the all-day strip and adds an optional resize grip.

Your last choice is saved locally (`chrome.storage.local`) and re-applied automatically whenever Google Calendar reloads.

## Screenshots

| | | |
|---|---|---|
| ![Screenshot 1](screenshots/Screenshot1.png) | ![Screenshot 2](screenshots/Screenshot2.png) | ![Screenshot 3](screenshots/Screenshot3.png) |

## Installation

### From source (developer mode)

1. Clone or download this repository.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** and select this folder.
5. Open [Google Calendar](https://calendar.google.com/calendar/) and use the toolbar icon.

## Project structure

```
manifest.json     Extension manifest (MV3)
index.html/.js    Toolbar popup UI and logic
about.html         Options page / description shown to users
app/content.js     Content script injected into calendar.google.com
css/style.css      Shared styling for popup and about pages
images/            Icons
screenshots/        Store listing screenshots
```

## Permissions

- `storage` - remembers your chosen display option locally.
- Content script access to `https://calendar.google.com/calendar/*` - needed to adjust the height of the all-day events area.

No analytics, no tracking, no external network requests. See [PRIVACY.md](PRIVACY.md) for details.

## License

[MIT](LICENSE)
