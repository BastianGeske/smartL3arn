import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { StatusBar, Style } from '@capacitor/status-bar'

export async function saveExport(
  filename: string,
  content: string,
  mimeType: string,
): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      await Filesystem.writeFile({
        path: filename,
        data: content,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      })
      const { uri } = await Filesystem.getUri({ path: filename, directory: Directory.Cache })
      await Share.share({
        title: filename,
        files: [uri],
        dialogTitle: `Export ${filename}`,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!/cancel/i.test(message)) throw error
    }
    return
  }

  const url = URL.createObjectURL(new Blob([content], { type: mimeType }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export async function setupStatusBar(dark: boolean): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  await StatusBar.setOverlaysWebView({ overlay: false })
  await syncStatusBar(dark)
}

export async function syncStatusBar(dark: boolean): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light })
  await StatusBar.setBackgroundColor({ color: dark ? '#101416' : '#f6f7f8' })
}
