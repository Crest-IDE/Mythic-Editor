import fs from 'fs';
import path from 'path';

const helixTomlPath = '/data/data/com.termux/files/home/project/helix/languages.toml';
const outDir = path.resolve('src/core/language');
const outJsonPath = path.join(outDir, 'languages.json');

if (!fs.existsSync(helixTomlPath)) {
  console.error(`Helix languages.toml not found at ${helixTomlPath}`);
  process.exit(1);
}

const tomlContent = fs.readFileSync(helixTomlPath, 'utf8');
const chunks = tomlContent.split(/\n(?=\[\[language\]\])/);
const languages = [];

for (const chunk of chunks) {
  if (!chunk.startsWith('[[language]]')) continue;

  const nameM = chunk.match(/name\s*=\s*"([^"]+)"/);
  if (!nameM) continue;
  const id = nameM[1];

  let extensions = [];
  const ftM = chunk.match(/file-types\s*=\s*\[([^\]]*)\]/s);
  if (ftM) {
    extensions = ftM[1]
      .split(',')
      .map(s => s.trim().replace(/^"/, '').replace(/"$/, ''))
      .filter(s => s && !s.includes('{'));
  }

  let lineComment = undefined;
  const sCommentM = chunk.match(/comment-token\s*=\s*"([^"]+)"/);
  if (sCommentM) {
    lineComment = sCommentM[1];
  } else {
    const mCommentM = chunk.match(/comment-tokens\s*=\s*\[\s*"([^"]+)"/);
    if (mCommentM) lineComment = mCommentM[1];
  }

  let blockComment = undefined;
  const startM = chunk.match(/start\s*=\s*"([^"]+)"/);
  const endM = chunk.match(/end\s*=\s*"([^"]+)"/);
  if (startM && endM) {
    blockComment = [startM[1], endM[1]];
  }

  let tabSize = undefined;
  const indentM = chunk.match(/tab-width\s*=\s*(\d+)/);
  if (indentM) tabSize = parseInt(indentM[1], 10);

  let grammar = id;
  const grammarM = chunk.match(/grammar\s*=\s*"([^"]+)"/);
  if (grammarM) grammar = grammarM[1];

  languages.push({
    id,
    extensions,
    lineComment,
    blockComment,
    tabSize,
    grammar
  });
}

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outJsonPath, JSON.stringify(languages, null, 2));
console.log(`✅ Successfully generated languages.json with ${languages.length} languages at ${outJsonPath}`);
