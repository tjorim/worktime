let templates = [];
let currentTasks = [];

const selectors = {
  dateInput: "#dateInput",
  taskInput: "#taskInput",
  tagSelect: "#tagSelect",
  startTime: "#startTime",
  stopTime: "#stopTime",
  taskList: "#taskList",
  templates: "#templates",
  toggleTemplates: "#toggleTemplates",
  openTemplateModal: "#openTemplateModal",
  closeTemplateModal: "#closeTemplateModal",
  templateModal: "#templateModal",
  editModal: "#editModal",
  closeEditModal: "#closeEditModal",
  addTaskBtn: "#addTaskBtn",
  formError: "#form-error",
  saveNewTemplate: "#saveNewTemplate",
  saveEditTemplate: "#saveEditTemplate",
};

function $(selector) {
  return document.querySelector(selector);
}

function setError(message) {
  const error = $(selectors.formError);
  if (!error) {
    return;
  }
  error.textContent = message || "";
  error.style.display = message ? "block" : "none";
}

function timeToMinutes(time) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function isValidRange(start, stop) {
  return timeToMinutes(stop) > timeToMinutes(start);
}

function hasOverlap(start, stop, skipId) {
  const startMin = timeToMinutes(start);
  const stopMin = timeToMinutes(stop);
  return currentTasks.some((task) => {
    if (task.id === skipId) {
      return false;
    }
    const taskStart = timeToMinutes(task.start);
    const taskStop = timeToMinutes(task.stop);
    return startMin < taskStop && stopMin > taskStart;
  });
}

async function loadTasks() {
  const taskDate = $(selectors.dateInput).value;
  const res = await fetch("/get_tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date: taskDate }),
  });
  const tasks = await res.json();
  tasks.sort((a, b) => a.start.localeCompare(b.start));
  currentTasks = tasks;

  const list = $(selectors.taskList);
  list.innerHTML = "";
  tasks.forEach((task) => {
    const li = document.createElement("li");
    const id = task.id;
    li.dataset.taskId = id;
    li.innerHTML = `
      <strong>${task.text}</strong> <span class="tag ${task.tag}">${task.tag}</span><br>
      <small>
        Start: <span id="start-${id}">${task.start}</span>
        Stop: <span id="stop-${id}">${task.stop}</span>
      </small><br>
      <input type="time" id="newStart-${id}" value="${task.start}">
      <input type="time" id="newStop-${id}" value="${task.stop}">
      <button class="update-task">Update</button>
      <button class="remove-btn">Remove</button>
    `;
    list.appendChild(li);
  });
  updateProgress(tasks);
}

async function loadTemplates() {
  const res = await fetch("/get_templates");
  templates = await res.json();
  renderTemplates();
}

function renderTemplates() {
  const container = $(selectors.templates);
  container.innerHTML = "";
  templates.forEach((tpl) => {
    const div = document.createElement("div");
    div.innerHTML = `
      <button class="apply-template" data-id="${tpl.id}">
        ${tpl.text} (${tpl.start}-${tpl.stop})
      </button>
      <button class="edit-template" data-id="${tpl.id}">Edit</button>
      <button class="delete-template" data-id="${tpl.id}">Delete</button>
    `;
    container.appendChild(div);
  });
}

function openModal() {
  $(selectors.templateModal).style.display = "flex";
}

function closeModal() {
  $(selectors.templateModal).style.display = "none";
}

async function addNewTemplate() {
  const text = $("#newText").value.trim();
  const tag = $("#newTag").value;
  const start = $("#newStart").value;
  const stop = $("#newStop").value;

  if (!text || !start || !stop) {
    setError("Fill all template fields.");
    return;
  }
  if (!isValidRange(start, stop)) {
    setError("Template stop time must be after start time.");
    return;
  }

  await fetch("/add_template", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, tag, start, stop }),
  });

  closeModal();
  $("#newText").value = "";
  $("#newStart").value = "";
  $("#newStop").value = "";
  setError("");
  loadTemplates();
}

let editId = null;

function editTemplate(id) {
  editId = id;
  const tpl = templates.find((item) => item.id === id);
  if (!tpl) {
    return;
  }
  $("#editText").value = tpl.text;
  $("#editTag").value = tpl.tag;
  $("#editStart").value = tpl.start;
  $("#editStop").value = tpl.stop;
  $(selectors.editModal).style.display = "flex";
}

function closeEditModal() {
  $(selectors.editModal).style.display = "none";
}

async function saveEditTemplate() {
  if (!editId) {
    return;
  }
  const newText = $("#editText").value.trim();
  const newTag = $("#editTag").value;
  const newStart = $("#editStart").value;
  const newStop = $("#editStop").value;

  if (!newText || !newStart || !newStop) {
    setError("Fill all template fields.");
    return;
  }
  if (!isValidRange(newStart, newStop)) {
    setError("Template stop time must be after start time.");
    return;
  }

  await fetch("/update_template", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: editId,
      template: { text: newText, tag: newTag, start: newStart, stop: newStop },
    }),
  });

  closeEditModal();
  setError("");
  loadTemplates();
}

async function deleteTemplate(id) {
  await fetch("/delete_template", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  loadTemplates();
}

async function addTask() {
  const taskDate = $(selectors.dateInput).value;
  const text = $(selectors.taskInput).value.trim();
  const tag = $(selectors.tagSelect).value;
  const start = $(selectors.startTime).value;
  const stop = $(selectors.stopTime).value;
  const id = crypto.randomUUID();

  if (!text || !taskDate || !start || !stop) {
    setError("Please fill in all fields.");
    return;
  }
  if (!isValidRange(start, stop)) {
    setError("Stop time must be after start time.");
    return;
  }
  if (hasOverlap(start, stop)) {
    setError("Time range overlaps an existing task.");
    return;
  }

  await fetch("/add_task", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date: taskDate, text, tag, start, stop, id }),
  });
  $(selectors.taskInput).value = "";
  setError("");
  loadTasks();
}

async function removeTask(id) {
  await fetch("/remove_task", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  loadTasks();
}

async function updateTaskTimes(button, id, taskDate) {
  const li = button.closest("li");
  const newStart = li.querySelector('input[id^="newStart"]').value;
  const newStop = li.querySelector('input[id^="newStop"]').value;
  if (!newStart || !newStop) {
    setError("Please select both start and stop times.");
    return;
  }
  if (!isValidRange(newStart, newStop)) {
    setError("Stop time must be after start time.");
    return;
  }
  if (hasOverlap(newStart, newStop, id)) {
    setError("Time range overlaps an existing task.");
    return;
  }

  await fetch("/update_task_times", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date: taskDate, id, newStart, newStop }),
  });

  setError("");
  loadTasks();
}

function calculateDuration(start, stop) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = stop.split(":").map(Number);
  return ((eh * 60 + em) - (sh * 60 + sm)) / 60;
}

function updateProgress(tasks) {
  let totalHours = 0;
  tasks.forEach((task) => {
    if (task.start && task.stop) {
      totalHours += calculateDuration(task.start, task.stop);
    }
  });

  const percentage = (totalHours / 8.5) * 100;
  const bar = $("#progress-bar");
  const text = $("#progress-text");

  bar.style.width = `${percentage}%`;
  text.textContent = `${totalHours.toFixed(2)}h (${percentage.toFixed(1)}%)`;
  bar.style.backgroundColor = percentage > 100 ? "#ff9800" : "#4caf50";
}

function applyTemplate(id) {
  const tpl = templates.find((item) => item.id === id);
  if (!tpl) {
    return;
  }
  $(selectors.taskInput).value = tpl.text;
  $(selectors.tagSelect).value = tpl.tag;
  $(selectors.startTime).value = tpl.start;
  $(selectors.stopTime).value = tpl.stop;
}

function toggleTemplates() {
  const btn = $(selectors.toggleTemplates);
  const content = document.querySelector(".content");
  if (content.style.display === "block") {
    content.style.display = "none";
    btn.textContent = "▶ Show templates";
  } else {
    content.style.display = "block";
    btn.textContent = "▼ Hide templates";
  }
}

function bindEvents() {
  $(selectors.addTaskBtn).addEventListener("click", addTask);
  $(selectors.openTemplateModal).addEventListener("click", openModal);
  $(selectors.closeTemplateModal).addEventListener("click", closeModal);
  $(selectors.closeEditModal).addEventListener("click", closeEditModal);
  $(selectors.saveNewTemplate).addEventListener("click", addNewTemplate);
  $(selectors.saveEditTemplate).addEventListener("click", saveEditTemplate);
  $(selectors.toggleTemplates).addEventListener("click", toggleTemplates);
  $(selectors.dateInput).addEventListener("change", loadTasks);

  $(selectors.templates).addEventListener("click", (event) => {
    const id = Number(event.target.dataset.id);
    if (!id) {
      return;
    }
    if (event.target.classList.contains("apply-template")) {
      applyTemplate(id);
    } else if (event.target.classList.contains("edit-template")) {
      editTemplate(id);
    } else if (event.target.classList.contains("delete-template")) {
      deleteTemplate(id);
    }
  });

  $(selectors.taskList).addEventListener("click", (event) => {
    const li = event.target.closest("li");
    if (!li) {
      return;
    }
    const id = li.dataset.taskId;
    const taskDate = $(selectors.dateInput).value;
    if (event.target.classList.contains("remove-btn")) {
      removeTask(id);
    } else if (event.target.classList.contains("update-task")) {
      updateTaskTimes(event.target, id, taskDate);
    }
  });
}

window.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  loadTasks();
  loadTemplates();
});
