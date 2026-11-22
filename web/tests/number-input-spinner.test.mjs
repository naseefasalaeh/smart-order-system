import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("globals.css removes spinner buttons for input[type=number]", () => {
  const cssPath = path.resolve("src/app/globals.css");
  assert.ok(fs.existsSync(cssPath), "globals.css should exist");

  const css = fs.readFileSync(cssPath, "utf-8");

  // Verify webkit spinner removal
  assert.match(
    css,
    /input\[type=["']?number["']?\]::-webkit-outer-spin-button[\s\S]*?-webkit-appearance:\s*none/,
    "webkit-outer-spin-button must have -webkit-appearance: none"
  );
  assert.match(
    css,
    /input\[type=["']?number["']?\]::-webkit-inner-spin-button[\s\S]*?-webkit-appearance:\s*none/,
    "webkit-inner-spin-button must have -webkit-appearance: none"
  );

  // Verify standard and Firefox spinner removal
  assert.match(
    css,
    /input\[type=["']?number["']?\][\s\S]*?-moz-appearance:\s*textfield/,
    "input[type=number] must have -moz-appearance: textfield"
  );
  assert.match(
    css,
    /input\[type=["']?number["']?\][\s\S]*?appearance:\s*textfield/,
    "input[type=number] must have appearance: textfield"
  );
});

test("root layout imports globals.css", () => {
  const layoutPath = path.resolve("src/app/layout.tsx");
  assert.ok(fs.existsSync(layoutPath), "layout.tsx should exist");
  const layout = fs.readFileSync(layoutPath, "utf-8");
  assert.match(layout, /import\s+["']\.\/globals\.css["']/, "layout must import globals.css");
});

test("number inputs throughout the system retain type=number", () => {
  const filesWithNumberInput = [
    "src/app/dashboard/ingredients/categories/page.tsx",
    "src/app/dashboard/ingredients/new/page.tsx",
    "src/app/dashboard/ingredients/[id]/edit/page.tsx",
    "src/app/dashboard/menus/new/page.tsx",
    "src/app/dashboard/menus/[id]/edit/page.tsx",
    "src/app/dashboard/menus/[id]/edit/RecipeIngredientSelector.tsx",
    "src/components/addon-editor.tsx",
    "src/components/ingredient-reset-fields.tsx",
    "src/components/new-menu-recipe.tsx",
    "src/components/session-payment.tsx",
  ];

  for (const relativePath of filesWithNumberInput) {
    const fullPath = path.resolve(relativePath);
    assert.ok(fs.existsSync(fullPath), `${relativePath} must exist`);
    const content = fs.readFileSync(fullPath, "utf-8");
    assert.match(
      content,
      /type="number"/,
      `${relativePath} should maintain type="number"`
    );
  }
});
