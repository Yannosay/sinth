---
title: Binding forms
description: Two-way binding for inputs, checkboxes and selects.
---

# Binding forms

`model:` (or its alias `bind:`) keeps a variable and an input in sync:

```sinth
var str name = ""
var num age = 18
var bool agree = false
var str plan = "free"
var str[] toppings = []

Input(model: name, placeholder: "Name")
Input(type: "number", model: age)          -- numbers stay numbers
Input(type: "range", model: age, min: 0, max: 120)
Textarea(model: bio)
Checkbox(model: agree)
Radio(name: "plan", value: "free", model: plan)
Radio(name: "plan", value: "pro", model: plan)
Select(model: plan) {
  Option(value: "free") { "Free" }
  Option(value: "pro") { "Pro" }
}
Checkbox(value: "cheese", model: toppings)  -- array of checked values
Select(multiple: true, model: toppings) { ... }
```

Bindings also work on object fields and array items: `Checkbox(model: todo.done)`, `Input(model: rows[i].name)`.
