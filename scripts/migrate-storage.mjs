#!/usr/bin/env node
// 旧 Firebase Storage から、web/ が参照している素材だけを新しいバケットへコピーする（#30）。
//
//   node scripts/migrate-storage.mjs --dry-run      # コピー対象の一覧だけ表示
//   node scripts/migrate-storage.mjs                # ダウンロード → gsutil でアップロード → 公開 URL で確認
//
// 旧バケットは公開読み取りの REST API で一覧・ダウンロードする（認証不要）。
// アップロードは gsutil を使うので、新しいプロジェクトに書き込める Google アカウントで gcloud にログインしておくこと。
// 環境変数: FROM_BUCKET / TO_BUCKET（既定は下記）、CLOUDSDK_CORE_ACCOUNT（使うアカウント。アクティブを切り替えずに済む）
// Node 22 以上（グローバル fetch）。追加依存なし。

import { readFile, readdir, mkdir, writeFile, mkdtemp } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const FROM = process.env.FROM_BUCKET || 'song-fes-ippon-gp.firebasestorage.app';
const TO = process.env.TO_BUCKET || 'song-ogiri-gp.firebasestorage.app';
const DRY = process.argv.includes('--dry-run');
const api = (bucket) => `https://firebasestorage.googleapis.com/v0/b/${bucket}/o`;
const root = new URL('..', import.meta.url).pathname;

async function listBucket(bucket) {
  const names = [];
  let pageToken = '';
  do {
    const res = await fetch(`${api(bucket)}?maxResults=1000${pageToken ? `&pageToken=${pageToken}` : ''}`);
    if (!res.ok) throw new Error(`list ${bucket}: ${res.status} ${await res.text()}`);
    const body = await res.json();
    names.push(...(body.items || []).map((i) => i.name));
    pageToken = body.nextPageToken || '';
  } while (pageToken);
  return names;
}

async function webFiles(dir = join(root, 'web')) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...await webFiles(p));
    else if (/\.(html|js)$/.test(e.name)) out.push(p);
  }
  return out;
}

// コード中の素材パスを取り出す。参照の形は次の 3 通り:
//   STORAGE_BASE + 'folder%2Fname?alt=media'（data-asset="folder%2Fname" も同じ）
//   BASE + 'name?alt=media' / BASE + encodeURIComponent('name')（HOST の BASE = STORAGE_BASE + 'mp3%2F'）
async function referencedPaths() {
  const refs = new Set();
  for (const f of await webFiles()) {
    const s = await readFile(f, 'utf8');
    for (const m of s.matchAll(/(?:STORAGE_BASE \+ |data-asset=")['"]?([A-Za-z0-9_]+%2F[^'"?]+)/g)) refs.add(decodeURIComponent(m[1]));
    for (const m of s.matchAll(/(?<![A-Z_])BASE \+ '([^'?]+)\?alt/g)) refs.add('mp3/' + decodeURIComponent(m[1]));
    for (const m of s.matchAll(/(?<![A-Z_])BASE \+ encodeURIComponent\('([^']+)'\)/g)) refs.add('mp3/' + m[1]);
  }
  return refs;
}

const all = await listBucket(FROM);
const refs = await referencedPaths();
const have = new Set(all);
const targets = all.filter((n) => refs.has(n));
const missing = [...refs].filter((r) => !have.has(r)).sort();
console.log(`${FROM}: ${all.length} objects, ${targets.length} referenced by web/`);
for (const n of targets) console.log('  ' + n);
if (missing.length) {
  console.log(`\nwarning: ${missing.length} paths are referenced by web/ but do not exist in ${FROM} (already broken there):`);
  for (const n of missing) console.log('  ' + n);
}
if (DRY) process.exit(0);

const dir = await mkdtemp(join(tmpdir(), 'migrate-storage-'));
for (const n of targets) {
  const res = await fetch(`${api(FROM)}/${encodeURIComponent(n)}?alt=media`);
  if (!res.ok) throw new Error(`download ${n}: ${res.status}`);
  const out = join(dir, n);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, Buffer.from(await res.arrayBuffer()));
}
console.log(`downloaded to ${dir}`);

const up = spawnSync('gsutil', ['-m', '-h', 'Cache-Control:public, max-age=3600', 'cp', '-r', '.', `gs://${TO}/`], { cwd: dir, stdio: 'inherit' });
if (up.status !== 0) throw new Error(`gsutil exited with ${up.status}`);

let ng = 0;
for (const n of targets) {
  const res = await fetch(`${api(TO)}/${encodeURIComponent(n)}?alt=media`, { method: 'HEAD' });
  if (!res.ok) { ng++; console.log(`NG ${res.status} ${n}`); }
}
console.log(ng ? `\n${ng} objects are not readable on ${TO} (storage rules deployed?)` : `\nall ${targets.length} objects are readable on ${TO}`);
process.exit(ng ? 1 : 0);
