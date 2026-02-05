import type { Task, Template } from "../types";

type StoredTask = Task & { date: string };

const TASKS_KEY = "webplanner_tasks";
const TEMPLATES_KEY = "webplanner_templates";

function loadJson<T>(key: string, fallback: T): T {
  if (typeof localStorage === "undefined") {
    return fallback;
  }
  const raw = localStorage.getItem(key);
  if (!raw) {
    return fallback;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function saveJson<T>(key: string, value: T) {
  if (typeof localStorage === "undefined") {
    return;
  }
  localStorage.setItem(key, JSON.stringify(value));
}

export function getTasks(): StoredTask[] {
  return loadJson<StoredTask[]>(TASKS_KEY, []);
}

export function saveTasks(tasks: StoredTask[]) {
  saveJson(TASKS_KEY, tasks);
}

export function getTemplates(): Template[] {
  return loadJson<Template[]>(TEMPLATES_KEY, []);
}

export function saveTemplates(templates: Template[]) {
  saveJson(TEMPLATES_KEY, templates);
}
