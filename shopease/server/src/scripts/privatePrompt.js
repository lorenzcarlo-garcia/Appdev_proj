const {stdin,stdout}=require('node:process');
function hiddenPassword(label) {
  return new Promise((resolve, reject) => {
    let value = '';
    stdout.write(label);
    stdin.setEncoding('utf8');
    stdin.setRawMode(true);
    stdin.resume();
    function cleanup() {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write('\n');
    }
    function onData(chunk) {
      for (const character of chunk.toString('utf8')) {
        if (character === '\u0003') { cleanup(); return reject(new Error('Cancelled')); }
        if (character === '\r' || character === '\n') { cleanup(); return resolve(value); }
        if (character === '\u007f' || character === '\b') value = value.slice(0, -1);
        else if (character >= ' ') value += character;
      }
    }
    stdin.on('data', onData);
  });
}

module.exports={hiddenPassword};
