#!/usr/bin/env node
/** Run from luvcoachai-portal, keeping the extracted bundle OUTSIDE the project.
 *  node ~/Downloads/coaching-workspace-v1/install.mjs --check
 *  node ~/Downloads/coaching-workspace-v1/install.mjs --apply
 *  No npm commands, SQL, downloads, environment reads or deployments are run.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const root = fs.realpathSync(process.cwd());
const mode = process.argv[2];
const hash = b => crypto.createHash("sha256").update(b).digest("hex");
const normalizedHash = s => hash(s.replaceAll("\r\n", "\n").trim());
const manifest = JSON.parse(fs.readFileSync(path.join(here,"install-manifest.json"),"utf8"));
function fail(message) { throw new Error(message); }
function safeTarget(relative) {
  if (path.isAbsolute(relative) || relative.split(/[\\/]/).includes("..")) fail("Unsafe target path.");
  const target = path.resolve(root, relative);
  if (!target.startsWith(root + path.sep)) fail("Target is outside the project.");
  let cursor = root;
  for (const segment of relative.split("/")) { cursor = path.join(cursor,segment); if (fs.existsSync(cursor) && fs.lstatSync(cursor).isSymbolicLink()) fail(`Refusing symbolic link: ${relative}`); }
  return target;
}
function writeAtomic(target, bytes) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temp = `${target}.coaching-${process.pid}.tmp`;
  try { fs.writeFileSync(temp,bytes,{flag:"wx"}); fs.renameSync(temp,target); }
  finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}
try {
  if (!["--check","--apply","--rollback"].includes(mode)) fail("Use --check, --apply, or --rollback <backup-directory>.");
  const project = JSON.parse(fs.readFileSync(path.join(root,"package.json"),"utf8"));
  if (project.name !== manifest.project || !fs.existsSync(path.join(root,"src/app/PortalShell.tsx"))) fail("Run this from the luvcoachai-portal project folder, not Downloads or the main MiraLuna app.");
  if (mode === "--rollback") {
    if (!process.argv[3]) fail("Pass the backup-directory path printed by --apply.");
    const backup = fs.realpathSync(path.resolve(root,process.argv[3]));
    if (!backup.startsWith(path.join(root,".coaching-workspace-backups")+path.sep)) fail("Use a backup made inside this project's .coaching-workspace-backups directory.");
    const saved = JSON.parse(fs.readFileSync(path.join(backup,"restore.json"),"utf8"));
    if (saved.projectRoot !== root) fail("This backup belongs to another project.");
    for (const entry of saved.files) { const target = safeTarget(entry.path); if (!fs.existsSync(target) || hash(fs.readFileSync(target)) !== entry.installedHash) fail(`File changed after installation; rollback stopped: ${entry.path}`); }
    for (const entry of saved.files) { const target=safeTarget(entry.path); if (entry.existed) writeAtomic(target,fs.readFileSync(path.join(backup,entry.backup))); else fs.unlinkSync(target); }
    console.log("Portal files restored. No database functions or authored content were removed."); process.exit(0);
  }
  const pending=[];
  for (const [relative,expected] of Object.entries(manifest.files)) {
    const source=path.join(here,"files",relative); const bytes=fs.readFileSync(source);
    if(hash(bytes)!==expected) fail(`Bundle file failed its integrity check: ${relative}`);
    const target=safeTarget(relative); const existed=fs.existsSync(target);
    const previous=existed?fs.readFileSync(target):null;
    if(existed && hash(previous)===expected) continue;
    const priorHash=manifest.replacements[relative];
    if(priorHash && (!previous || normalizedHash(previous.toString("utf8"))!==priorHash)) fail(`Existing file differs from the version reviewed. No files were changed. Send the current ${relative} before installing.`);
    if(!priorHash && existed) fail(`New-file collision: ${relative}. No files were changed. Do not overwrite it.`);
    pending.push({path:relative,target,bytes,previous,existed,installedHash:expected});
  }
  if(!pending.length){console.log("This exact workspace build is already installed. Nothing changed.");process.exit(0);}
  const replacementCount=pending.filter(x=>x.existed).length;
  console.log(`Preflight passed: ${pending.length-replacementCount} new files; ${replacementCount} reviewed replacements.`);
  if(mode==="--check"){console.log("CHECK ONLY — no files or database objects changed. Run --apply after reviewing the plan.");process.exit(0);}
  const backupRelative=`.coaching-workspace-backups/${new Date().toISOString().replaceAll(":","-").replaceAll(".","-")}`;
  const backup=safeTarget(backupRelative); fs.mkdirSync(backup,{recursive:true});
  const entries=pending.map((e,i)=>({path:e.path,existed:e.existed,installedHash:e.installedHash,backup:`original-${i}.backup`}));
  for(let i=0;i<pending.length;i++) if(pending[i].existed) fs.writeFileSync(path.join(backup,entries[i].backup),pending[i].previous);
  fs.writeFileSync(path.join(backup,"restore.json"),JSON.stringify({version:manifest.version,projectRoot:root,files:entries},null,2));
  const done=[];
  try{for(const e of pending){writeAtomic(e.target,e.bytes);done.push(e);}}
  catch(e){for(const x of done.reverse()){if(x.existed)writeAtomic(x.target,x.previous);else if(fs.existsSync(x.target))fs.unlinkSync(x.target);}throw e;}
  console.log("Installed portal code. No SQL, npm installation, permission changes or deployment were performed.");
  console.log(`Backup: ${backupRelative}`);
  console.log(`Rollback: node "${path.join(here,"install.mjs")}" --rollback "${backupRelative}"`);
  console.log("Next: run npm run build. Keep this bundle and the backup until testing is complete.");
}catch(e){console.error("STOP:",e.message);process.exitCode=1;}
