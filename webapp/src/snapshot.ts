// webapp/src/snapshot.ts
const ALLOW = [".ts",".py",".json",".jres",".md"];
const DENY  = [".hex",".uf2",".asm"];

function allowed(name: string) {
  const n = name.toLowerCase();
  if (DENY.some(e => n.endsWith(e))) return false;
  return ALLOW.some(e => n.endsWith(e));
}

async function listFilesViaPackageAPI(): Promise<{name:string,content:string}[]> {
  // 案1: パッケージ API から列挙（MainPackage/EditorPackageなど）
  // 実環境のAPIに合わせて実装してください
  const out: {name:string,content:string}[] = [];
  const files = (await (pxt as any).editor?.projectView?.allFilesAsync?.()) || [];
  for (const f of files) {
    if (!allowed(f.name)) continue;
    out.push({ name: f.name, content: f.content || "" });
  }
  return out;
}

async function listFilesViaUIState(): Promise<{name:string,content:string}[]> {
  // 案2: UI から見えているファイル群を拾う（フォールバック）
  // 実装はプロジェクトの状態管理に依存
  return [];
}

export async function buildProjectSnapshot() {
  const files = (await listFilesViaPackageAPI()).length
    ? await listFilesViaPackageAPI()
    : await listFilesViaUIState();

  return {
    schema: "pxt-project@1",
    projectId: (window as any).__currentProjectId__ || undefined,
    target: "microbit",
    files,
    meta: {
      editor: (window as any).__currentEditor__ || "monaco",
      pxtVersion: (pxt as any)?.pxtVersion || undefined,
      lang: navigator.language || "ja",
      created: (window as any).__projectCreatedAt__ || undefined,
      modified: new Date().toISOString()
    }
  };
}
