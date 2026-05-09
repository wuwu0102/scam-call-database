const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');

const templates = [
  {
    file: 'community_seed_numbers.csv',
    header: 'number,sourceName,sourceUrl,sourceType,confidence,tag,note\n'
  },
  {
    file: 'community_seed_needed.csv',
    header: 'number,sourceName,sourceUrl,sourceType,confidence,tag,note\n'
  },
  {
    file: 'community_seed_rejects.csv',
    header: 'number,sourceName,sourceUrl,sourceType,confidence,tag,note,rejectReason\n'
  }
];

for (const item of templates) {
  const filePath = path.join(DATA_DIR, item.file);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, item.header, 'utf8');
    console.log(`created ${path.relative(ROOT, filePath)}`);
  } else {
    const content = fs.readFileSync(filePath, 'utf8');
    if (!content.trim()) {
      fs.writeFileSync(filePath, item.header, 'utf8');
      console.log(`initialized ${path.relative(ROOT, filePath)}`);
    } else {
      console.log(`kept ${path.relative(ROOT, filePath)}`);
    }
  }
}
