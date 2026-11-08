// pdf2png.swift — rasterize selected pages of a PDF to PNG (macOS PDFKit, no deps).
// usage: swift tools/pdf2png.swift <in.pdf> <outdir> <dpi> <page,page,...|all>
import Foundation
import PDFKit
import AppKit

let args = CommandLine.arguments
guard args.count >= 5 else {
    FileHandle.standardError.write("usage: pdf2png <in.pdf> <outdir> <dpi> <pages|all>\n".data(using: .utf8)!)
    exit(2)
}
let inURL = URL(fileURLWithPath: args[1])
let outDir = URL(fileURLWithPath: args[2])
let dpi = Double(args[3]) ?? 110
let spec = args[4]

guard let doc = PDFDocument(url: inURL) else {
    FileHandle.standardError.write("cannot open pdf\n".data(using: .utf8)!)
    exit(1)
}
try? FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)

let scale = dpi / 72.0
var indices: [Int] = []
if spec == "all" {
    indices = Array(0..<doc.pageCount)
} else {
    indices = spec.split(separator: ",").compactMap { Int($0.trimmingCharacters(in: .whitespaces)) }
}

for idx in indices {
    guard let page = doc.page(at: idx) else { continue }
    let box = page.bounds(for: .mediaBox)
    let w = Int((box.width * scale).rounded())
    let h = Int((box.height * scale).rounded())
    guard let rep = NSBitmapImageRep(
        bitmapDataPlanes: nil, pixelsWide: w, pixelsHigh: h,
        bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
        colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0
    ) else { continue }
    rep.size = NSSize(width: w, height: h)
    guard let ctx = NSGraphicsContext(bitmapImageRep: rep) else { continue }
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = ctx
    let cg = ctx.cgContext
    cg.setFillColor(NSColor.white.cgColor)
    cg.fill(CGRect(x: 0, y: 0, width: w, height: h))
    cg.scaleBy(x: scale, y: scale)
    cg.translateBy(x: -box.origin.x, y: -box.origin.y)
    page.draw(with: .mediaBox, to: cg)
    NSGraphicsContext.restoreGraphicsState()
    guard let data = rep.representation(using: .png, properties: [:]) else { continue }
    let out = outDir.appendingPathComponent(String(format: "page-%02d.png", idx + 1))
    try? data.write(to: out)
    print("wrote \(out.path) \(w)x\(h)")
}
