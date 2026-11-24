# Local PaddleOCR assets

The browser worker uses `paddleocr@1.2.1`, `onnxruntime-web@1.31.1` (WASM with one thread) and the PP-OCRv5 mobile detector plus Latin recognizer. No receipt bytes are submitted to an inference endpoint. These files can be cached on demand. The existing Tesseract engine remains available when the larger model is unavailable.

The files `det.onnx` and `latin.onnx` are from the RapidOCR v3.10.0 ONNX release, sourced from its [official model repository](https://www.modelscope.cn/models/RapidAI/RapidOCR). The recognition dictionary is the recognizer's `character` metadata. See included license and notice files.

To regenerate `engine.js`, bundle `engine-entry.mjs` for the browser in ESM format using esbuild against the versions above. Copy `ort-wasm-simd-threaded.mjs` and `ort-wasm-simd-threaded.wasm` from the corresponding ONNX Runtime Web distribution. When replacing runtime assets, advance the model cache version in `sw.js`.
