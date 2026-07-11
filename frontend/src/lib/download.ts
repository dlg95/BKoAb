function parseFilename(contentDisposition: string | null, fallback: string) {
  if (!contentDisposition) return fallback
  const match = /filename="?([^"]+)"?/i.exec(contentDisposition)
  return match?.[1] ?? fallback
}

export async function fetchDocxExport(url: string, fallbackFilename: string) {
  const response = await fetch(url, { method: "POST" })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || response.statusText)
  }
  const blob = await response.blob()
  const filename = parseFilename(response.headers.get("Content-Disposition"), fallbackFilename)
  return { blob, filename }
}

export async function pickExportDirectory() {
  if (!("showDirectoryPicker" in window)) {
    return null
  }
  try {
    return await window.showDirectoryPicker({ mode: "readwrite" })
  } catch {
    return null
  }
}

export async function saveDocxBlob(
  blob: Blob,
  filename: string,
  directoryHandle?: FileSystemDirectoryHandle | null,
) {
  if (directoryHandle) {
    const fileHandle = await directoryHandle.getFileHandle(filename, { create: true })
    const writable = await fileHandle.createWritable()
    await writable.write(blob)
    await writable.close()
    return "directory" as const
  }

  if ("showSaveFilePicker" in window) {
    try {
      const fileHandle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description: "Word-Dokument",
            accept: {
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
            },
          },
        ],
      })
      const writable = await fileHandle.createWritable()
      await writable.write(blob)
      await writable.close()
      return "picker" as const
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return "cancelled" as const
      }
    }
  }

  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
  return "download" as const
}
