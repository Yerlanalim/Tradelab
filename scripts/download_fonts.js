const https = require('https');
const fs = require('fs');
const path = require('path');

const fonts = [
  {
    name: 'Roboto-Regular.ttf',
    url: 'https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Mu4mxK.ttf'
  },
  {
    name: 'Roboto-Bold.ttf',
    url: 'https://fonts.gstatic.com/s/roboto/v30/KFOlCnqEu92Fr1Mu4mxP.ttf'
  }
];

const dir = path.join(__dirname, '..', 'public', 'fonts');
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

function download(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return download(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Status: ${res.statusCode}`));
      }
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', reject);
  });
}

async function run() {
  for (const font of fonts) {
    console.log(`Downloading ${font.name}...`);
    try {
      await download(font.url, path.join(dir, font.name));
      console.log(`Done ${font.name}`);
    } catch (e) {
      console.error(`Failed ${font.name}: ${e.message}`);
    }
  }
}

run();
