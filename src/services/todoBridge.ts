import type { TodoItem } from '../types';

const electron = (window as any).electron;

export async function getTodos(chatId: string): Promise<TodoItem[]> {
  if (!electron?.todos) return [];
  return electron.todos.get(chatId);
}

export async function setTodos(chatId: string, items: TodoItem[]): Promise<TodoItem[]> {
  if (!electron?.todos) return items;
  return electron.todos.set(chatId, items);
}

export async function clearTodos(chatId: string): Promise<TodoItem[]> {
  if (!electron?.todos) return [];
  return electron.todos.clear(chatId);
}
