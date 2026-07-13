function parseFilename(contentDisposition: string | null, fallback: string) {
  if (!contentDisposition) return fallback
  const match = /filename="?([^"]+)"?/i.exec(contentDisposition)
  return match?.[1] ?? fallback
}

export async function fetchExport(url: string, fallbackFilename: string) {
  const response = await fetch(url, { method: "POST" })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || response.statusText)
  }
  const blob = await response.blob()
  const filename = parseFilename(response.headers.get("Content-Disposition"), fallbackFilename)
  return { blob, filename }
}

/** @deprecated use fetchExport */
export async function fetchDocxExport(url: string, fallbackFilename: string) {
  return fetchExport(url, fallbackFilename)
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

export async function saveExportBlob(
  blob: Blob,
  filename: string,
  directoryHandle?: FileSystemDirectoryHandle | null,
  mimeType = "application/octet-stream",
  description = "Datei",
  extension = "",
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
      const accept: Record<string, string[]> = {}
      if (mimeType && extension) {
        accept[mimeType] = [extension]
      }
      const fileHandle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: accept
          ? [{ description, accept }]
          : undefined,
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

export async function saveDocxBlob(
  blob: Blob,
  filename: string,
  directoryHandle?: FileSystemDirectoryHandle | null,
) {
  return saveExportBlob(
    blob,
    filename,
    directoryHandle,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "Word-Dokument",
    ".docx",
  )
}

export async function savePdfBlob(
  blob: Blob,
  filename: string,
  directoryHandle?: FileSystemDirectoryHandle | null,
) {
  return saveExportBlob(blob, filename, directoryHandle, "application/pdf", "PDF-Dokument", ".pdf")
}
