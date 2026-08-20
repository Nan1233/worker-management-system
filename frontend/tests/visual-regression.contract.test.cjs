const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

test("KTC visual system has one canonical token source and Tailwind maps to it", () => {
  const ref = read("src/reference-ui.css");
  const basic = read("src/basic.css");

  assert.match(ref, /--ktc-bg:\s*#f4f7fb/);
  assert.match(ref, /--ktc-text:\s*#162033/);
  assert.match(ref, /--ktc-primary:\s*#1769d2/);
  assert.match(basic, /--color-background:\s*var\(--ktc-bg\)/);
  assert.match(basic, /--color-foreground:\s*var\(--ktc-text\)/);
  assert.match(basic, /--color-primary:\s*var\(--ktc-primary\)/);
  assert.doesNotMatch(basic, /--color-background:\s*#f6f8fb/);
});

test("shared UI primitives are present for the critical visual vocabulary", () => {
  for (const file of [
    "src/components/ui/KtcButton.tsx",
    "src/components/ui/KtcCard.tsx",
    "src/components/ui/KtcBadge.tsx",
    "src/components/ui/KtcField.tsx",
    "src/components/ui/KtcPageHeader.tsx",
    "src/components/ui/index.ts",
  ]) {
    assert.ok(fs.existsSync(path.join(root, file)), file);
  }

  const ref = read("src/reference-ui.css");
  for (const selector of [
    ".ktc-ui-button",
    ".ktc-ui-card",
    ".ktc-ui-badge",
    ".ktc-ui-field",
    ".ktc-ui-page-header",
  ]) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(ref, new RegExp(`${escaped}\\s*\\{`));
  }
});

test("critical management and worker surfaces retain reference UI contracts", () => {
  const files = [
    "src/pages/manager/Dashboard.css",
    "src/pages/manager/Reports.css",
    "src/pages/worker/ProcessPage.css",
    "src/pages/worker/ProductionHistory.css",
  ];

  for (const file of files) {
    const source = read(file);
    assert.doesNotMatch(source, /--ktc-(bg|text|primary)\s*:/, `${file} must not redefine canonical tokens`);
  }

  const ref = read("src/reference-ui.css");
  assert.match(ref, /\.management-sidebar[\s\S]*?width:\s*244px/);
  assert.match(ref, /\.management-header[\s\S]*?min-height:\s*64px/);
  assert.match(ref, /\.worker-layout[\s\S]*?background:\s*var\(--ktc-workspace\)/);
});

test("shared primitives expose mobile-safe touch targets", () => {
  const ref = read("src/reference-ui.css");
  assert.match(ref, /\.ktc-ui-button[\s\S]*?min-height:\s*40px/);
  assert.match(ref, /@media \(max-width: 700px\)[\s\S]*?\.ktc-ui-button\s*\{\s*min-height:\s*42px/);
});
