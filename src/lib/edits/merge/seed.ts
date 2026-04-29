// One-shot handoff from outside the editor (e.g. multi-file drop on the home
// screen) into the in-editor merge panel. The home view stashes a File here,
// the EditorView auto-opens the merge tool, and MergePanel consumes the seed
// once on mount. Single-slot on purpose: there is exactly one merge panel.
let seed: File | null = null

export function setMergeSeed(file: File | null) {
  seed = file
}

export function consumeMergeSeed(): File | null {
  const f = seed
  seed = null
  return f
}
