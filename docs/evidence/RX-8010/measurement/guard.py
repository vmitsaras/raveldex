from pathlib import Path
import hashlib,json,subprocess
root=Path('/Users/vasilis/Documents/GitHub/raveldex')
def snapshot():
 files=[]
 for folder in ['src','test','bench','scripts','site','integrations']:
  files.extend(p for p in (root/folder).rglob('*') if p.is_file() and 'node_modules' not in p.parts and 'dist' not in p.parts)
 files.extend(root/p for p in ['package.json','package-lock.json','docs/planning/roadmap.json'])
 files.extend(root.glob('*.md'))
 files.extend(p for p in (root/'docs').rglob('*.md') if 'evidence' not in p.relative_to(root/'docs').parts)
 return {str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(set(files))}
if __name__=='__main__':print(json.dumps(snapshot(),indent=2))
