import { useCallback, useMemo, useReducer } from 'react'

// Deep enough for a long editing session, shallow enough that the stacks never
// grow without bound (each entry holds a whole towers + shapes snapshot).
const LIMIT = 50

const capPast = (past) => (past.length > LIMIT ? past.slice(past.length - LIMIT) : past)

function reducer(state, action) {
  switch (action.type) {
    // An undoable change.
    case 'commit': {
      const doc = typeof action.doc === 'function' ? action.doc(state.doc) : action.doc
      if (doc === state.doc) return state
      return { doc, past: capPast([...state.past, state.doc]), future: [] }
    }
    // A change that should not land on the stack — per-keystroke typing, where
    // one undo per character would bury every real edit.
    case 'set': {
      const doc = typeof action.doc === 'function' ? action.doc(state.doc) : action.doc
      return doc === state.doc ? state : { ...state, doc }
    }
    case 'undo': {
      if (!state.past.length) return state
      return {
        doc: state.past[state.past.length - 1],
        past: state.past.slice(0, -1),
        future: [state.doc, ...state.future].slice(0, LIMIT),
      }
    }
    case 'redo': {
      if (!state.future.length) return state
      return {
        doc: state.future[0],
        past: capPast([...state.past, state.doc]),
        future: state.future.slice(1),
      }
    }
    // Loading a different line or file starts a new document; its history is
    // not yours to step back into.
    case 'reset':
      return { doc: action.doc, past: [], future: [] }
    default:
      return state
  }
}

/**
 * One undo/redo history over the whole editable document — towers and shapes
 * together — so a single Ctrl+Z means the same thing everywhere in the app.
 *
 * Selection and mode deliberately live outside it: stepping back through
 * "which tower was selected" would make undo feel random.
 */
export default function useDocumentHistory(initialDoc) {
  const [state, dispatch] = useReducer(reducer, { doc: initialDoc, past: [], future: [] })

  const commit = useCallback((doc) => dispatch({ type: 'commit', doc }), [])
  const setDoc = useCallback((doc) => dispatch({ type: 'set', doc }), [])
  const undo   = useCallback(() => dispatch({ type: 'undo' }), [])
  const redo   = useCallback(() => dispatch({ type: 'redo' }), [])
  const reset  = useCallback((doc) => dispatch({ type: 'reset', doc }), [])

  return useMemo(() => ({
    doc: state.doc,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    commit,
    setDoc,
    undo,
    redo,
    reset,
  }), [state.doc, state.past.length, state.future.length, commit, setDoc, undo, redo, reset])
}
