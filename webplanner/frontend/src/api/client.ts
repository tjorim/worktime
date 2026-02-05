import type { Task, Template } from "../types";
import { getTasks, getTemplates, saveTasks, saveTemplates } from "../storage/localStore";

type StoredTask = Task & { date: string };

function isBetween(date: string, start: string, end: string) {
  return date >= start && date <= end;
}

export async function fetchTasks(date: string): Promise<Task[]> {
  const tasks = getTasks();
  return tasks.filter((task) => task.date === date).map(({ date: _, ...rest }) => rest);
}

export async function fetchTasksRange(
  startDate: string,
  endDate: string
): Promise<Array<{ date: string; tag: string; start: string; stop: string }>> {
  return getTasks()
    .filter((task) => isBetween(task.date, startDate, endDate))
    .map((task) => ({
      date: task.date,
      tag: task.tag,
      start: task.start,
      stop: task.stop
    }));
}

export async function addTask(payload: {
  date: string;
  text: string;
  tag: string;
  start: string;
  stop: string;
  id: string;
}): Promise<void> {
  const tasks = getTasks();
  const next: StoredTask = { ...payload };
  tasks.push(next);
  saveTasks(tasks);
}

export async function removeTask(id: string): Promise<void> {
  const tasks = getTasks();
  saveTasks(tasks.filter((task) => task.id !== id));
}

export async function updateTaskTimes(payload: {
  date: string;
  id: string;
  newStart: string;
  newStop: string;
}): Promise<void> {
  const tasks = getTasks();
  const updated = tasks.map((task) =>
    task.id === payload.id && task.date === payload.date
      ? { ...task, start: payload.newStart, stop: payload.newStop }
      : task
  );
  saveTasks(updated);
}

export async function fetchTemplates(): Promise<Template[]> {
  return getTemplates();
}

export async function addTemplate(payload: {
  text: string;
  tag: string;
  start: string;
  stop: string;
}): Promise<void> {
  const templates = getTemplates();
  const maxId = templates.reduce((max, tpl) => Math.max(max, tpl.id), 0);
  templates.push({ id: maxId + 1, ...payload });
  saveTemplates(templates);
}

export async function updateTemplate(payload: {
  id: number;
  template: { text: string; tag: string; start: string; stop: string };
}): Promise<void> {
  const templates = getTemplates();
  const updated = templates.map((tpl) =>
    tpl.id === payload.id ? { id: payload.id, ...payload.template } : tpl
  );
  saveTemplates(updated);
}

export async function deleteTemplate(id: number): Promise<void> {
  const templates = getTemplates();
  saveTemplates(templates.filter((tpl) => tpl.id !== id));
}
