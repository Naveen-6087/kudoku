module.exports = function patchBbWorkerLoader(source) {
  if (source.includes("from './main.worker.js'")) {
    source = source.replace(/import\s+MainWorker\s+from\s+'\.\/main\.worker\.js';\s*/g, "");
    source = source.replace(/new\s+MainWorker\(\)/g, "new Worker(new URL('./main.worker.js', import.meta.url))");
  }

  if (source.includes("from './thread.worker.js'")) {
    source = source.replace(/import\s+ThreadWorker\s+from\s+'\.\/thread\.worker\.js';\s*/g, "");
    source = source.replace(/new\s+ThreadWorker\(\)/g, "new Worker(new URL('./thread.worker.js', import.meta.url))");
  }

  return source.replace(/\/\* webpackIgnore: true \*\/ /g, "");
};
