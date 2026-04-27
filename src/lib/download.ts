/** Trigger a file download from a Uint8Array or string in the browser. */
export function downloadBlob(content: Uint8Array | string, filename: string, mime: string) {
  const part: BlobPart = typeof content === 'string'
    ? content
    : (content.buffer.slice(0) as ArrayBuffer)
  const blob = new Blob([part], { type: mime })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
