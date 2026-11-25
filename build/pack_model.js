// encrypt the gzipped 4D model for the public repo: node build/pack_model.js model.bin.gz
const c = require('crypto'), fs = require('fs'), path = require('path');
const key = Buffer.from(process.env.DATA_KEY, 'hex'), gz = fs.readFileSync(process.argv[2]);
const iv = c.randomBytes(12), e = c.createCipheriv('aes-256-gcm', key, iv), ct = Buffer.concat([e.update(gz), e.final()]);
const root = path.join(__dirname, '..');
fs.writeFileSync(path.join(root, 'model.enc'), Buffer.concat([iv, e.getAuthTag(), ct]));
fs.writeFileSync(path.join(root, 'model.ver'), c.createHash('sha256').update(gz).digest('hex').slice(0, 12) + '\n');
console.log('model.enc', (ct.length / 1e6).toFixed(2), 'MB');
