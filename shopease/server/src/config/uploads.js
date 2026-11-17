const path = require('node:path');
const root = path.resolve(__dirname, '../../storage/report-photos');
const maxBytes = 5 * 1024 * 1024;
function photoPath(directory, name) {
  if (!/^[a-f0-9]{32}\.webp$/.test(name)) throw new Error('Invalid stored photo name');
  return path.join(path.resolve(directory), name);
}
module.exports = {root, maxBytes, photoPath};
