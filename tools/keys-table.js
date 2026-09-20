// Prints the default keybindings as a Markdown table (used for README.md).
// deno run --allow-read tools/keys-table.js
const src = Deno.readTextFileSync(new URL("../package/contents/code/shortcuts.js", import.meta.url));
const list = new Function(src + "\nreturn shortcutList();")();
const rows = list.filter((s) => !/^(desktop|moveToDesktop|moveToDesktopSilent|groupWindow)\d+$/.test(s.action) || /[1]$/.test(s.action));
console.log("| Keys | Action |\n|---|---|");
for (const s of rows) {
    let key = s.key || "(unbound)";
    let text = s.text.replace(/^HyprKwin: /, "");
    if (/^(desktop|moveToDesktop|moveToDesktopSilent|groupWindow)1$/.test(s.action)) {
        key = key.replace(/1$/, "1…0").replace(/!$/, "! … )").replace(/Alt\+1…0$/, s.action.startsWith("group") ? "Alt+1…5" : "Alt+1…0");
        text = text.replace(/ 1$/, " 1–" + (s.action.startsWith("group") ? "5" : "10"));
    }
    console.log(`| \`${key.replaceAll("|", "\\|")}\` | ${text} |`);
}
