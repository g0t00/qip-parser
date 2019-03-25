#!/usr/local/bin/node

'use strict';
const child_process = require('child_process');
const fs = require('fs');
const {argv} = require('process');

class QipParser {
  constructor(path, relativePath) {
    this.path = path;
    this.relativePath = relativePath;
    this.getFileContents();
  }
  getFileContents() {
    this.QipText = fs.readFileSync(this.path, {
      encoding: 'utf8'
    });
  }
  parse() {
    let files = [];
    this.QipText = this.QipText.replace(/\r/g, '');
    this.QipText.split('\n').forEach(line => {
      // console.log('line', line);
      line = line.replace(/#.*/, '');
      if (line.match('set_global_assignment') !== null) {
        let match = line.match(/-library ([^ ]+)/);
        let work = 'work';
        if (match !== null) {
          work = match[1];
        }
        let pathMatch = line.match(/\[file join \$::quartus\(qip_path\) "([^"]+)"\]/);
        if (line.match('-name VHDL_FILE') !== null) {

          if (pathMatch !== null) {
            let path = pathMatch[1];
            // let mixedFlag = path.match(/pkg/i) !== null ? '-mixedsvvh' : '';
            let mixedFlag = '-mixedsvvh';
            const file = {path: this.relativePath + path, work};
            files.push(file);
            // console.log(command);
          } else {
            console.error('A unable to parse: ', line);
          }
        } else if (line.match('-name QIP_FILE')) {
          if (pathMatch !== null) {
            let path = pathMatch[1];
            let pathArg = path.replace(/[^/]*$/, '');
            const subParser = new QipParser(this.relativePath + path, this.relativePath + pathArg);
            const filesNew = subParser.parse();
            files = files.concat(filesNew);
          } else {
            console.error('B unable to parse: ', line);
          }
        } else {
          console.error('C unable to parse: ', line);
        }
      }

      // console.log(line);
    });
    return files;
  }
}
let targetFile = process.argv[2];
let relativePath = targetFile.replace(/[^/]+$/, '');
const touchFile = relativePath + 'sources.touch';
const parser = new QipParser(targetFile, relativePath);
let files = parser.parse();
files.forEach(file => {
  file.path = file.path.replace(/[^/ .]+\/\.\.\//g, '')
});
let lastCompile;
try {
  lastCompile = fs.statSync(touchFile).mtimeMs;

} catch (e) {
  lastCompile = 0;
}
let doFile = [];
// order files
const compare = (a, b) => {
  // console.log(compare, a, b,  a.path, b.path);
  if (a.text.match(/^\s*package\s+\w+\s+is/im) !== null) {
    return false;
  } else if (b.text.match(/^\s*package\s+\w+\s+is/im) !== null) {
    return true;
  }
  if (!b.entity) {
    return false;
  }
  if (!a.entity) {
    return false;
  }
  if (a.text.match(new RegExp(`entity\\s+(${b.work}|work)\\.${b.entity}`, 'im'))) {
    return true;
  }
  if (b.text.match(new RegExp(`entity\\s+(${a.work}|work)\\.${a.entity}`, 'im'))) {
    return false;
  }


  return false;
}
let changed = true;
files = files.filter((file, index) => {
  return files.slice(index + 1)
  .findIndex(fileSearch => fileSearch.path === file.path && fileSearch.work === fileSearch.work) === -1;
})
for (const file of files) {
  file.text = fs.readFileSync(file.path, {encoding: 'utf8'});
  const match = file.text.match(/^\s*entity\s+(\w+)\s*is/im);
  if (match !== null) {
    file.entity = match[1];
  } else {
    // console.error('no entity', file.path);
  }
}
let changeCounter = 0;
while (changed) {
  changed = false;
  loop: for (let a = 0; a < files.length - 1; a++) {
    for (let b = a + 1; b < files.length; b++) {
      if (compare(files[a], files[b])) {
        // console.log(`swapping ${a} ${b} ${files[a].entity} with ${files[b].entity}`);
        // console.log(files.map(file => file.entity));
        const bObj = files.splice(b, 1)[0];
        files.splice(a, 0, bObj);
        // console.log(files.map(file => file.entity));
        // asd;
        changed = true;
        changeCounter++;
        break loop;
      }
    }
  }
}
console.log('changeCounter', changeCounter)
for (const file of files) {
  const thisChangeTime = fs.statSync(file.path).mtimeMs;
  if (thisChangeTime > lastCompile || argv[3] == '--build-all') {
    doFile.push(`vcom -2008 -mixedsvvh -work ${file.work} ${file.path}`);
  }
}
doFile.push(`set fp [open "${touchFile}" w+]`);
doFile.push(`close $fp`);
doFile.push(`file mtime ${touchFile} [clock seconds]`);
doFile = doFile.join('\n');
// doFile = optimizeDoFile(doFile);
doFile = '#### auto generated with qip-parser. DONT EDIT ####\n'  + doFile;
fs.writeFileSync(relativePath + 'sources.do', doFile);
// console.log(parser.parse());
