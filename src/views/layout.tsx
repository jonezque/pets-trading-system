import type { FC, PropsWithChildren } from "hono/jsx";

// Page shell: loads HTMX and holds the global stylesheet. Individual fragments
// are rendered server-side and swapped in by HTMX.
export const Layout: FC<PropsWithChildren> = ({ children }) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Pets Trading System</title>
      <script src="https://unpkg.com/htmx.org@2.0.4"></script>
      {/* idiomorph: morph-style swaps preserve focus + the value of the input
          the user is editing, so the 3s polling never steals focus mid-typing. */}
      <script src="https://unpkg.com/idiomorph@0.7.3/dist/idiomorph-ext.min.js"></script>
      {/* Keep the value of the focused input untouched during a morph (default
          would overwrite it with the server-rendered empty value). Focus itself
          is restored by id (restoreFocus is on by default). */}
      <script>{`if (window.Idiomorph) { Idiomorph.defaults.ignoreActiveValue = true; }`}</script>
      <style>{CSS}</style>
    </head>
    <body hx-ext="morph">{children}</body>
  </html>
);

const CSS = `
:root {
  --bg: #0f1216; --panel: #181d24; --panel-2: #1f2630; --line: #2a323d;
  --text: #e6edf3; --muted: #8b98a5; --accent: #4cc2ff; --good: #3fb950;
  --bad: #f85149; --warn: #d29922; --chip: #263040;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text);
  font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
header { padding: 12px 18px; border-bottom: 1px solid var(--line);
  display: flex; align-items: center; gap: 14px; background: var(--panel); }
header h1 { font-size: 16px; margin: 0; letter-spacing: .3px; }
header .tag { color: var(--muted); font-size: 12px; }
main { padding: 16px; }
.grid { display: grid; gap: 14px; grid-template-columns: repeat(3, 1fr); }
@media (max-width: 1100px) { .grid { grid-template-columns: 1fr; } }
.wide { display: grid; gap: 14px; grid-template-columns: 2fr 1fr; margin-top: 14px; }
@media (max-width: 1100px) { .wide { grid-template-columns: 1fr; } }
.card { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 12px; }
.card h2 { font-size: 13px; margin: 0 0 10px; text-transform: uppercase;
  letter-spacing: .6px; color: var(--muted); }
.panel-title { display: flex; justify-content: space-between; align-items: baseline; }
.money { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin: 8px 0 12px; }
.money div { background: var(--panel-2); border-radius: 6px; padding: 6px 8px; }
.money .k { color: var(--muted); font-size: 11px; }
.money .v { font-size: 15px; font-weight: 600; }
.total .v { color: var(--accent); }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 6px 6px; border-bottom: 1px solid var(--line); font-size: 13px; }
th { color: var(--muted); font-weight: 500; font-size: 11px; text-transform: uppercase; }
.muted { color: var(--muted); }
.chip { display: inline-block; padding: 1px 7px; border-radius: 20px; font-size: 11px;
  background: var(--chip); color: var(--text); }
.chip.expired { background: #3a2326; color: var(--bad); }
.chip.listed { background: #14313f; color: var(--accent); }
.chip.active { background: #163a22; color: var(--good); }
.chip.outbid, .chip.rejected, .chip.withdrawn { background: #3a3320; color: var(--warn); }
button { background: var(--accent); color: #04263a; border: 0; border-radius: 6px;
  padding: 5px 10px; font-weight: 600; cursor: pointer; font-size: 12px; }
button.ghost { background: var(--chip); color: var(--text); }
button.danger { background: #3a2326; color: var(--bad); }
button.good { background: #163a22; color: var(--good); }
input, select { background: var(--panel-2); color: var(--text); border: 1px solid var(--line);
  border-radius: 6px; padding: 4px 6px; font-size: 12px; }
input[type=number] { width: 74px; }
form.inline { display: inline-flex; gap: 4px; align-items: center; }
.row-actions { display: flex; gap: 4px; flex-wrap: wrap; align-items: center; }
.notif { font-size: 12px; padding: 5px 0; border-bottom: 1px dashed var(--line); color: var(--muted); }
.notif b { color: var(--text); }
.err { color: var(--bad); font-size: 12px; }
.bar { height: 6px; background: var(--panel-2); border-radius: 4px; overflow: hidden; }
.bar > span { display: block; height: 100%; background: var(--good); }
.small { font-size: 11px; }
`;
