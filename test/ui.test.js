"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { run } = require("./dom");

const PAGE = `import { Button, Field, Select, Modal, Tabs, Table, Pagination, Dropdown, Toaster, toast } from "sinth:ui"
var bool open = false
var str name = ""
var str plan = "pro"
var num tab = 0
var num page = 1
var obj[] rows = [{ name: "Linus", age: 28 }, { name: "Ada", age: 36 }]
Main {
  Button(id: "save", loading: true) { "Save" }
  Button(id: "notify", onClick: toast("Saved", "success", 0)) { "Toast" }
  Field(label: "Name", value: name, hint: "Your full name")
  Select(label: "Plan", value: plan, options: ["free", { value: "pro", label: "Pro" }])
  Tabs(tabs: ["One", "Two"], selected: tab) {
    Div { "first" }
    Div { "second" }
  }
  Table(columns: [{ key: "name", label: "Name" }, { key: "age", label: "Age" }], rows: rows, sortable: true)
  Pagination(page: page, total: 10)
  Dropdown(label: "Actions") { Button(id: "edit") { "Edit" } }
  Button(id: "open", onClick: open = true) { "Open" }
  Modal(open: open, title: "Hello") { Button(id: "inside") { "OK" } }
  Toaster()
  Paragraph(id: "state") { tab + "," + page }
}`;

test("sinth:ui components render accessible markup and react to input", async () => {
  const app = await run(PAGE);
  const { $, doc, flush, window } = app;

  assert.equal($("#save").disabled, true);
  assert.equal($("#save").getAttribute("aria-busy"), "true");

  const input = $(".ui-field input");
  const hint = $(".ui-field__hint");
  assert.equal(input.getAttribute("aria-describedby"), hint.id);
  await flush();
  assert.equal($(".ui-field select").value, "pro");

  const tabs = doc.querySelectorAll("[role=tab]");
  assert.equal(tabs[0].getAttribute("aria-selected"), "true");
  tabs[0].dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
  await flush();
  assert.equal(tabs[1].getAttribute("aria-selected"), "true");
  assert.equal($(".ui-tabs__panel").getAttribute("data-selected"), "1");

  const cells = () => [...doc.querySelectorAll(".ui-table tbody td:first-child")].map(td => td.textContent);
  assert.deepEqual(cells(), ["Linus", "Ada"]);
  $(".ui-table__sort").click();
  assert.deepEqual(cells(), ["Ada", "Linus"]);
  $(".ui-table__sort").click();
  assert.deepEqual(cells(), ["Linus", "Ada"]);
  assert.equal($(".ui-table th").getAttribute("aria-sort"), "descending");

  const pager = [...doc.querySelectorAll(".ui-pagination__item")];
  assert.equal(pager[0].disabled, true);
  pager[pager.length - 1].click();
  assert.equal(app.text("#state"), "1,2");
  assert.equal($("[aria-current=page]").textContent, "2");

  $(".ui-dropdown__trigger").click();
  assert.ok($(".ui-dropdown__menu"));
  $(".ui-dropdown").dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.equal($(".ui-dropdown__menu"), null);

  $("#open").focus();
  $("#open").click();
  await flush();
  const dialog = $("[role=dialog]");
  assert.ok(dialog);
  assert.equal(dialog.getAttribute("aria-labelledby"), $(".ui-modal__title").id);
  assert.equal(doc.documentElement.style.overflow, "hidden");
  $(".ui-modal").dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.ok($(".ui-modal").hasAttribute("inert"));
  await new Promise(r => setTimeout(r, 250));
  assert.equal($("[role=dialog]"), null);
  assert.equal(doc.documentElement.style.overflow, "");
  assert.equal(doc.activeElement, $("#open"));

  $("#notify").click();
  assert.equal($(".ui-toast__message").textContent, "Saved");
  $(".ui-toast__close").click();
  assert.equal($(".ui-toast"), null);
});

test("library tabs, pagination and sort headers are plain buttons, not the Button component", async () => {
  const app = await run(PAGE);
  for (const el of app.doc.querySelectorAll(".ui-tabs__tab, .ui-pagination__item, .ui-table__sort")) {
    assert.equal(el.tagName, "BUTTON");
    assert.equal(el.classList.contains("ui-btn"), false);
    assert.equal(el.getAttribute("type"), "button");
  }
});

test("Html.Name always means the built-in element, even when a component shadows it", async () => {
  const app = await run(`component Button(str label) {
  Html.Button(class: "mine", type: "button") { label }
}
Main {
  Button(label: "Hi")
  Html.Button(id: "raw") { "Raw" }
}`);
  assert.equal(app.$(".mine").textContent, "Hi");
  assert.equal(app.$("#raw").tagName, "BUTTON");
  assert.equal(app.$("#raw").classList.contains("mine"), false);
});
