export function setupVisualViewport(): void {
  const update = () => {
    const viewport = window.visualViewport
    const style = document.documentElement.style
    style.setProperty('--visible-top', `${viewport?.offsetTop || 0}px`)
    style.setProperty('--visible-left', `${viewport?.offsetLeft || 0}px`)
    style.setProperty('--visible-height', `${viewport?.height || window.innerHeight}px`)
    style.setProperty('--visible-width', `${viewport?.width || window.innerWidth}px`)
  }
  window.addEventListener('resize', update)
  window.visualViewport?.addEventListener('resize', update)
  window.visualViewport?.addEventListener('scroll', update)
  update()
}
