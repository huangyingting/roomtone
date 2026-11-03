import type { Home } from "./model";

export interface History { home: Home | null; past: Home[]; future: Home[] }
export type HistoryAction = { type: "load" | "commit"; home: Home } | { type: "undo" | "redo" };
export const initialHistory: History = { home: null, past: [], future: [] };
export function historyReducer(state: History, action: HistoryAction): History {
  if (action.type === "load") return { home: action.home, past: [], future: [] };
  if (action.type === "commit") return {
    home: action.home, past: state.home ? [...state.past.slice(-49), state.home] : [], future: [],
  };
  if (action.type === "undo") {
    if (!state.home || !state.past.length) return state;
    return { home: state.past[state.past.length - 1], past: state.past.slice(0, -1), future: [state.home, ...state.future] };
  }
  if (!state.home || !state.future.length) return state;
  return { home: state.future[0], past: [...state.past, state.home], future: state.future.slice(1) };
}
