/**
 * ArchGuard Multi-Language Dependency Graph & Tarjan SCC Cycle Engine (Pure ESM)
 */

const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.java', '.go', '.cpp', '.hpp', '.h', '.c'];

export function normalizePath(p) {
  return String(p || '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/\/+/g, '/');
}

function dirname(p) {
  const idx = p.lastIndexOf('/');
  return idx === -1 ? '' : p.slice(0, idx);
}

function joinPath(baseDir, relPath) {
  const combined = baseDir ? `${baseDir}/${relPath}` : relPath;
  const parts = combined.split('/');
  const out = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (out.length > 0 && out[out.length - 1] !== '..') out.pop();
    } else {
      out.push(part);
    }
  }
  return out.join('/');
}

/**
 * Extract relative/internal module imports from source text.
 */
export function extractImports(filePath, content) {
  const imports = new Set();
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();

  if (['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'].includes(ext)) {
    const patterns = [
      /\bimport\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g,
      /\bexport\s+(?:[\s\S]*?\s+from\s+)['"]([^'"]+)['"]/g,
      /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
      /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    ];
    for (const re of patterns) {
      let m;
      while ((m = re.exec(content)) !== null) {
        imports.add(m[1]);
      }
    }
  } else if (ext === '.py') {
    const fromRe = /^\s*from\s+(\.+[a-zA-Z0-9_.]*|[a-zA-Z0-9_.]+)\s+import\b/gm;
    const impRe = /^\s*import\s+([a-zA-Z0-9_.,\s]+)/gm;
    let m;
    while ((m = fromRe.exec(content)) !== null) imports.add(m[1].trim());
    while ((m = impRe.exec(content)) !== null) {
      for (const token of m[1].split(',')) {
        const mod = token.trim().split(/\s+/)[0];
        if (mod) imports.add(mod);
      }
    }
  } else if (['.c', '.cpp', '.cc', '.h', '.hpp'].includes(ext)) {
    const incRe = /^\s*#include\s+"([^"]+)"/gm;
    let m;
    while ((m = incRe.exec(content)) !== null) imports.add(m[1]);
  } else if (ext === '.java' || ext === '.go') {
    const impRe = /^\s*import\s+(?:static\s+)?(?:"([^"]+)"|([a-zA-Z0-9_.]+))/gm;
    let m;
    while ((m = impRe.exec(content)) !== null) imports.add(m[1] || m[2]);
  }

  return [...imports];
}

/**
 * Resolve an import specifier against the known workspace file set.
 */
export function resolveInternalImport(fromFile, spec, fileSet) {
  if (!spec) return null;

  if (spec.startsWith('./') || spec.startsWith('../')) {
    const base = joinPath(dirname(fromFile), spec);
    if (fileSet.has(base)) return base;
    for (const ext of EXTENSIONS) {
      if (fileSet.has(base + ext)) return base + ext;
      if (fileSet.has(`${base}/index${ext}`)) return `${base}/index${ext}`;
    }
    return null;
  }

  const direct = joinPath(dirname(fromFile), spec);
  if (fileSet.has(direct)) return direct;
  if (fileSet.has(spec)) return spec;

  if (fromFile.endsWith('.py')) {
    const pyRel = spec.replace(/^\.+/, '').replace(/\./g, '/');
    if (pyRel) {
      const candidates = [
        `${pyRel}.py`,
        `${pyRel}/__init__.py`,
        joinPath(dirname(fromFile), `${pyRel}.py`),
      ];
      for (const c of candidates) {
        if (fileSet.has(c)) return c;
      }
    }
  }

  return null;
}

/**
 * Tarjan's Strongly Connected Components (O(V + E)) to detect circular dependency cycles.
 */
export function findDependencyCycles(nodes, edgesMap) {
  let index = 0;
  const indices = new Map();
  const lowlink = new Map();
  const onStack = new Set();
  const stack = [];
  const cycles = [];

  function strongConnect(v) {
    indices.set(v, index);
    lowlink.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);

    const neighbors = edgesMap.get(v) || [];
    for (const w of neighbors) {
      if (!indices.has(w)) {
        strongConnect(w);
        lowlink.set(v, Math.min(lowlink.get(v), lowlink.get(w)));
      } else if (onStack.has(w)) {
        lowlink.set(v, Math.min(lowlink.get(v), indices.get(w)));
      }
    }

    if (lowlink.get(v) === indices.get(v)) {
      const component = [];
      let w;
      do {
        w = stack.pop();
        onStack.delete(w);
        component.push(w);
      } while (w !== v);

      if (component.length > 1) {
        cycles.push(component.reverse());
      } else if (component.length === 1 && (edgesMap.get(v) || []).includes(v)) {
        cycles.push([v, v]);
      }
    }
  }

  for (const node of nodes) {
    if (!indices.has(node)) strongConnect(node);
  }

  return cycles;
}

export function classifyLayer(filePath) {
  const lower = filePath.toLowerCase();
  if (/(^|\/)(ui|views|components|pages|screens|frontend)\//.test(lower)) return 'presentation';
  if (/(^|\/)(controllers|routes|handlers|api|endpoints)\//.test(lower)) return 'transport';
  if (/(^|\/)(services|domain|usecases|application|core)\//.test(lower)) return 'domain';
  if (/(^|\/)(db|database|repositories|repos|models|prisma|dao|storage)\//.test(lower)) return 'persistence';
  return 'general';
}
