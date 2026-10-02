import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

// Package the selected raster artwork at the sizes required by each platform.
let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let sourceURL = root.appendingPathComponent("build/icon.png")
guard let source = CGImageSourceCreateWithURL(sourceURL as CFURL, nil),
      let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
    fatalError("Cannot read build/icon.png")
}

func writeIcon(_ path: String, size: Int, opaque: Bool, adaptive: Bool = false, round: Bool = false, artwork: CGImage = image) {
    let alpha = opaque ? CGImageAlphaInfo.noneSkipLast : CGImageAlphaInfo.premultipliedLast
    guard let context = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8,
        bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: alpha.rawValue) else {
        fatalError("Cannot create icon context")
    }
    let bounds = CGRect(x: 0, y: 0, width: size, height: size)
    if round {
        context.addEllipse(in: bounds)
        context.clip()
    }
    if opaque || round {
        context.setFillColor(CGColor(red: 112/255.0, green: 72/255.0, blue: 220/255.0, alpha: 1))
        context.fill(bounds)
    }
    context.interpolationQuality = .high
    // Android adaptive artwork stays inside the 66dp safe region of its 108dp canvas.
    let scale = adaptive ? 66.0 / 108.0 : 1.0
    let extent = Double(size) * scale
    let inset = (Double(size) - extent) / 2
    context.draw(artwork, in: CGRect(x: inset, y: inset, width: extent, height: extent))
    let output = root.appendingPathComponent(path)
    guard let rendered = context.makeImage(),
          let destination = CGImageDestinationCreateWithURL(output as CFURL, UTType.png.identifier as CFString, 1, nil) else {
        fatalError("Cannot write \(path)")
    }
    CGImageDestinationAddImage(destination, rendered, nil)
    guard CGImageDestinationFinalize(destination) else { fatalError("Cannot finish \(path)") }
    print("\(path): \(size)×\(size)")
}

let iosURL = root.appendingPathComponent("build/design/brand-kartenfaecher-ios.png")
guard let iosSource = CGImageSourceCreateWithURL(iosURL as CFURL, nil),
      let iosImage = CGImageSourceCreateImageAtIndex(iosSource, 0, nil) else {
    fatalError("Cannot read full-bleed iOS artwork")
}
writeIcon("ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png", size: 1024, opaque: true, artwork: iosImage)
for (density, size, foreground) in [("mdpi", 48, 108), ("hdpi", 72, 162), ("xhdpi", 96, 216), ("xxhdpi", 144, 324), ("xxxhdpi", 192, 432)] {
    let base = "android/app/src/main/res/mipmap-\(density)"
    writeIcon("\(base)/ic_launcher.png", size: size, opaque: false)
    writeIcon("\(base)/ic_launcher_round.png", size: size, opaque: false, round: true)
    writeIcon("\(base)/ic_launcher_foreground.png", size: foreground, opaque: false, adaptive: true)
}
